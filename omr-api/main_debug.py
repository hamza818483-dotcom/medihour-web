from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import base64
import json
import random

app = FastAPI(title="BeshiJoss OMR API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

def process_omr_logic(image_bytes, corners=None):
    np_arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None: 
        return {"error": "Could not read image"}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # ==========================================
    # STEP 1: PERFECT PERSPECTIVE WARP
    # ==========================================
    thresh_dark = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
    cnts, _ = cv2.findContours(thresh_dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    anchor_rects = []
    orig_area = image.shape[0] * image.shape[1]
    
    for c in cnts:
        area = cv2.contourArea(c)
        if orig_area * 0.0002 < area < orig_area * 0.02:
            x, y, w, h = cv2.boundingRect(c)
            aspect = w / float(h)
            extent = area / float(w * h)
            if 0.7 < aspect < 1.3 and extent > 0.75:
                anchor_rects.append((x, y, w, h))
    
    processing_mat = image.copy()
    
    if len(anchor_rects) >= 4:
        anchor_rects.sort(key=lambda r: r[0] + r[1])
        tl_rect = anchor_rects[0]
        br_rect = anchor_rects[-1]
        
        anchor_rects.sort(key=lambda r: r[0] - r[1])
        bl_rect = anchor_rects[0]
        tr_rect = anchor_rects[-1]

        tl = [tl_rect[0], tl_rect[1]]
        tr = [tr_rect[0] + tr_rect[2], tr_rect[1]]
        bl = [bl_rect[0], bl_rect[1] + bl_rect[3]]
        br = [br_rect[0] + br_rect[2], br_rect[1] + br_rect[3]]

        dstWidth = max(int(np.hypot(tr[0]-tl[0], tr[1]-tl[1])), int(np.hypot(br[0]-bl[0], br[1]-bl[1])))
        dstHeight = max(int(np.hypot(bl[0]-tl[0], bl[1]-tl[1])), int(np.hypot(br[0]-tr[0], br[1]-tr[1])))

        srcPts = np.float32([tl, tr, br, bl])
        dstPts = np.float32([[0, 0], [dstWidth, 0], [dstWidth, dstHeight], [0, dstHeight]])

        M = cv2.getPerspectiveTransform(srcPts, dstPts)
        processing_mat = cv2.warpPerspective(image, M, (dstWidth, dstHeight))

    # ==========================================
    # STEP 2: 6 MAIN BLOCKS EXTRACTION
    # ==========================================
    process_gray = cv2.cvtColor(processing_mat, cv2.COLOR_BGR2GRAY)
    block_thresh = cv2.adaptiveThreshold(process_gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 25, 6)

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))

    h_lines = cv2.morphologyEx(block_thresh, cv2.MORPH_OPEN, h_kernel)
    v_lines = cv2.morphologyEx(block_thresh, cv2.MORPH_OPEN, v_kernel)

    grid = cv2.addWeighted(h_lines, 0.5, v_lines, 0.5, 0.0)
    _, grid = cv2.threshold(grid, 50, 255, cv2.THRESH_BINARY)

    cnts, _ = cv2.findContours(grid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidate_blocks = []
    target_area = processing_mat.shape[0] * processing_mat.shape[1]

    for c in cnts:
        area = cv2.contourArea(c)
        if target_area * 0.01 < area < target_area * 0.40:
            x, y, w, h = cv2.boundingRect(c)
            if h > w:
                candidate_blocks.append({'rect': (x, y, w, h), 'area': area})

    candidate_blocks.sort(key=lambda b: b['area'], reverse=True)
    blocks = [b['rect'] for b in candidate_blocks[:6]]

    if len(blocks) != 6:
        return {"error": "Could not isolate the main 6 OMR tables. Ensure the whole sheet is clearly visible."}

    blocks.sort(key=lambda b: b[1])
    top_blocks = sorted(blocks[:2], key=lambda b: b[0])
    bottom_blocks = sorted(blocks[2:6], key=lambda b: b[0])

    roll_block, reg_block = top_blocks[0], top_blocks[1]
    q_blocks = bottom_blocks

    # ==========================================
    # STEP 3: RELATIVE INTENSITY MATH
    # ==========================================
    debug_img = processing_mat.copy()
    quiz_data, bubble_map = [], []

    SHRINK = 0.20

    def get_mean_darkness(col_x, row_y, c_width, c_height):
        roi_x = int(col_x + c_width * SHRINK)
        roi_y = int(row_y + c_height * SHRINK)
        roi_w = int(c_width * (1 - 2 * SHRINK))
        roi_h = int(c_height * (1 - 2 * SHRINK))
        
        roi = process_gray[roi_y:roi_y+roi_h, roi_x:roi_x+roi_w]
        
        return np.mean(roi) if roi.size > 0 else 255

    # --- 1. Extract Roll / Reg ---
    INFO_HEADER_RATIO = 0.185
    
    def process_info_block(block):
        bx, by, bw, bh = block
        start_y = by + (bh * INFO_HEADER_RATIO)
        row_h = (bh - (bh * INFO_HEADER_RATIO)) / 10.0
        col_w = bw / 6.0
        result = ""
        
        for c in range(6):
            col_x = bx + (c * col_w)
            means = []
            for r in range(10):
                row_y = start_y + (r * row_h)
                val = get_mean_darkness(col_x, row_y, col_w, row_h)
                means.append({'digit': r, 'val': val, 'y': row_y})
            
            min_m = min(m['val'] for m in means)
            max_m = max(m['val'] for m in means)
            selected = []
            
            if max_m - min_m > 25:
                threshold = min_m + ((max_m - min_m) * 0.5)
                selected = [m for m in means if m['val'] < threshold]
            
            if selected:
                result += "".join(str(m['digit']) for m in selected)
            else:
                result += "?"
        return result

    roll_no = process_info_block(roll_block)
    reg_no = process_info_block(reg_block)

    # --- 2. Extract Questions ---
    Q_HEADER_RATIO = 0.043
    Q_NUM_COL_RATIO = 0.18
    current_q = 1
    labels = ['A', 'B', 'C', 'D']

    for qb in q_blocks:
        bx, by, bw, bh = qb
        start_y = by + (bh * Q_HEADER_RATIO)
        row_h = (bh - (bh * Q_HEADER_RATIO)) / 25.0
        q_no_width = bw * Q_NUM_COL_RATIO
        opt_start_x = bx + q_no_width
        opt_w = (bw - q_no_width) / 4.0

        for r in range(25):
            row_y = start_y + (r * row_h)
            means = []
            
            for opt in range(4):
                col_x = opt_start_x + (opt * opt_w)
                val = get_mean_darkness(col_x, row_y, opt_w, row_h)
                means.append({'opt': opt, 'val': val, 'x': col_x})
            
            min_m = min(m['val'] for m in means)
            max_m = max(m['val'] for m in means)
            selected = []
            
            if max_m - min_m > 25:
                threshold = min_m + ((max_m - min_m) * 0.5)
                selected = [m for m in means if m['val'] < threshold]
            
            ans_str = ""
            if selected:
                for m in selected:
                    bubble_map.append({"q": current_q, "opt": labels[m['opt']], "x": int(m['x'] + opt_w / 2.0), "y": int(row_y + row_h / 2.0)})
                ans_str = ",".join(labels[m['opt']] for m in selected)
            
            # Formatted per your strict JSON requirements
            quiz_data.append({
                "question": str(current_q),
                "options": { "A": "", "B": "", "C": "", "D": "" },
                "correct_answer": ans_str,
                "explanation": ""
            })
            current_q += 1

    # ==========================================
    # STEP 4: ENCRYPTION & JSON RESPONSE
    # ==========================================
    tensor_nodes = []
    s2s = {"A":0, "B":1, "C":2, "D":3}
    for b in bubble_map:
        tensor_nodes.append({
            "n_idx": b["q"], "spin_state": s2s[b["opt"]],
            "alpha_v": round((b["x"]*3.14159)+42.0, 4), "beta_v": round((b["y"]*2.71828)-15.0, 4),
            "entropy": round(random.uniform(0.01,0.99), 5)
        })

    _, buf = cv2.imencode('.jpg', debug_img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    warped_b64 = base64.b64encode(buf).decode('utf-8')
    cipher = base64.b64encode(json.dumps(tensor_nodes).encode('utf-8')).decode('utf-8')

    return {
        "status": "resolved", 
        "image_width": processing_mat.shape[1], 
        "image_height": processing_mat.shape[0], 
        "radius": 14,
        "cipher_matrix": cipher, 
        "warped_image": f"data:image/jpeg;base64,{warped_b64}",
        "extracted_nodes": quiz_data, 
        "roll_no": roll_no, 
        "reg_no": reg_no,
    }


@app.post("/api/v1/scan-omr")
async def scan_omr(file: UploadFile = File(...), corners: str = Form(default=None)):
    parsed = None
    if corners:
        try: 
            parsed = json.loads(corners)
        except: 
            pass
    contents = await file.read()
    return process_omr_logic(contents, corners=parsed)


@app.get("/health")
async def health(): 
    return {"status": "ok"}

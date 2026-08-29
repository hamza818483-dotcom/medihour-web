import os
import cv2
import numpy as np
import base64
import json
import random
from fastapi import FastAPI, File, UploadFile, Form, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware

# Get environment variables
raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
if raw_origins == "*":
    ALLOWED_ORIGINS = ["*"]
else:
    # Strip whitespace and trailing slashes for standard origin matching
    ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in raw_origins.split(",") if o.strip()]

OMR_API_KEY = os.getenv("OMR_API_KEY", "beshijoss_omr_secure_ak_82535346565632343542673")

app = FastAPI(title="BeshiJoss OMR API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*", "X-API-Key"]
)

async def verify_api_key(x_api_key: str = Header(None)):
    if OMR_API_KEY and x_api_key != OMR_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return x_api_key

def detect_paper_edges(img):
    """Fallback perspective-correction when the 4 corner anchor squares
    aren't reliably detected (poor lighting, shadow, marker cut off, camera
    too far away). Finds the largest 4-sided contour in the image — assumed
    to be the sheet's own outer edge against the background — and warps it
    to a straight rectangle, similar to how CamScanner-style document
    scanners work. Returns the warped image, or None if no confident
    4-sided paper contour could be found."""
    h, w = img.shape[:2]
    img_area = h * w

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=1)

    cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None

    cnts = sorted(cnts, key=cv2.contourArea, reverse=True)[:5]
    paper_contour = None
    for c in cnts:
        area = cv2.contourArea(c)
        # The sheet should dominate most of the frame in a normal photo,
        # but not be the entire frame (that would just be image noise).
        if area < img_area * 0.25:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            paper_contour = approx
            break

    if paper_contour is None:
        return None

    pts = paper_contour.reshape(4, 2).astype(np.float32)
    # Order points: top-left, top-right, bottom-right, bottom-left
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]

    dstWidth = max(int(np.hypot(*(tr - tl))), int(np.hypot(*(br - bl))))
    dstHeight = max(int(np.hypot(*(bl - tl))), int(np.hypot(*(br - tr))))
    if dstWidth < 100 or dstHeight < 100:
        return None

    srcPts = np.float32([tl, tr, br, bl])
    dstPts = np.float32([[0, 0], [dstWidth, 0], [dstWidth, dstHeight], [0, dstHeight]])
    M = cv2.getPerspectiveTransform(srcPts, dstPts)
    return cv2.warpPerspective(img, M, (dstWidth, dstHeight))


def process_omr_logic(image_bytes, corners=None):
    np_arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None: 
        return {"error": "Could not read image"}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # ==========================================
    # STEP 1: PERFECT PERSPECTIVE WARP
    # ==========================================
    # Phase A: Initial Warp/Crop (if corners provided)
    if corners and len(corners) == 4:
        tl = [corners[0]['x'], corners[0]['y']]
        tr = [corners[1]['x'], corners[1]['y']]
        br = [corners[2]['x'], corners[2]['y']]
        bl = [corners[3]['x'], corners[3]['y']]

        dstWidth = max(int(np.hypot(tr[0]-tl[0], tr[1]-tl[1])), int(np.hypot(br[0]-bl[0], br[1]-bl[1])))
        dstHeight = max(int(np.hypot(bl[0]-tl[0], bl[1]-tl[1])), int(np.hypot(br[0]-tr[0], br[1]-tr[1])))

        srcPts = np.float32([tl, tr, br, bl])
        dstPts = np.float32([[0, 0], [dstWidth, 0], [dstWidth, dstHeight], [0, dstHeight]])

        M = cv2.getPerspectiveTransform(srcPts, dstPts)
        processing_mat = cv2.warpPerspective(image, M, (dstWidth, dstHeight))
    else:
        processing_mat = image.copy()

    # Phase B: Precise Anchor Refinement (Always try this on processing_mat)
    # Use adaptive threshold + morphology for shadow resilience
    temp_gray = cv2.cvtColor(processing_mat, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(temp_gray, (5, 5), 0)
    thresh_dark = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 10)
    morph_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    thresh_dark = cv2.morphologyEx(thresh_dark, cv2.MORPH_OPEN, morph_kernel)
    cnts, _ = cv2.findContours(thresh_dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    anchor_rects = []
    p_h, p_w = processing_mat.shape[:2]
    p_area = p_h * p_w
    
    for c in cnts:
        area = cv2.contourArea(c)
        # Use relaxed area constraints (0.02% to 10.0%) to handle both full and cropped photos
        if p_area * 0.0002 < area < p_area * 0.10:
            x, y, w, h = cv2.boundingRect(c)
            aspect = w / float(h)
            extent = area / float(w * h)
            if 0.7 < aspect < 1.3 and extent > 0.75:
                anchor_rects.append((x, y, w, h))
    
    anchors_found = len(anchor_rects) >= 4
    paper_edge_used = False

    if anchors_found:
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
        processing_mat = cv2.warpPerspective(processing_mat, M, (dstWidth, dstHeight))
    elif not (corners and len(corners) == 4):
        # The 4 corner anchor squares weren't confidently detected AND the
        # user didn't manually crop — try a CamScanner-style fallback that
        # finds the sheet's own outer paper edge against the background and
        # straightens to that instead. This handles tilted photos, shadows,
        # or a marker that's too small/cut off for anchor detection.
        edge_warped = detect_paper_edges(processing_mat)
        if edge_warped is not None:
            processing_mat = edge_warped
            paper_edge_used = True

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
    quiz_data, bubble_map, all_bubbles = [], [], []

    SHRINK = 0.20

    def get_fill_percent(col_x, row_y, c_width, c_height):
        """Returns the % of dark (ink) pixels inside a bubble's sampling
        region, using Otsu auto-thresholding so it adapts to scan
        lighting/contrast per-image instead of relying on a fixed gray
        cutoff."""
        roi_x = int(col_x + c_width * SHRINK)
        roi_y = int(row_y + c_height * SHRINK)
        roi_w = int(c_width * (1 - 2 * SHRINK))
        roi_h = int(c_height * (1 - 2 * SHRINK))

        roi = process_gray[roi_y:roi_y+roi_h, roi_x:roi_x+roi_w]
        if roi.size == 0:
            return 0.0

        _, roi_bin = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        dark_pixels = int(np.count_nonzero(roi_bin))
        return (dark_pixels / roi_bin.size) * 100.0

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
            
            if max_m - min_m > 12:
                threshold = min_m + ((max_m - min_m) * 0.55)
                selected = [m for m in means if m['val'] < threshold]
            
            if selected:
                result += "".join(str(m['digit']) for m in selected)
            else:
                result += "?"
        return result

    roll_no = process_info_block(roll_block)
    reg_no = process_info_block(reg_block)

    # --- 2. Extract Questions ---
    # Calibrated against the ACTUAL cv2.boundingRect() output of a real
    # scanned OMR sheet (not the idealized PDF coordinates) — the detected
    # contour box includes a few pixels of the outer table border, which
    # made the PDF-derived ratios drift (worse toward option D and toward
    # later rows) once applied to a real photo's slightly-larger box.
    # Measured directly from HoughCircles bubble centers vs. the real
    # detected block rect on a sample scan: A/B/C/D sit at 0.2820 / 0.4797 /
    # 0.6890 / 0.8866 of block width; row 0 starts at 5.278% of block height,
    # each row is 3.767% of block height tall.
    Q_ROW0_TOP_RATIO = 0.05278
    Q_ROW_H_RATIO = 0.037670
    Q_NUM_COL_RATIO = 0.18121
    OPT_SPACING_RATIO = 0.20155
    current_q = 1
    labels = ['A', 'B', 'C', 'D']

    for qb in q_blocks:
        bx, by, bw, bh = qb
        start_y = by + (bh * Q_ROW0_TOP_RATIO)
        row_h = bh * Q_ROW_H_RATIO
        opt_w = bw * OPT_SPACING_RATIO
        opt_start_x = bx + (bw * Q_NUM_COL_RATIO)

        for r in range(25):
            row_y = start_y + (r * row_h)
            means = []
            
            for opt in range(4):
                col_x = opt_start_x + (opt * opt_w)
                fill_pct = get_fill_percent(col_x, row_y, opt_w, row_h)
                means.append({'opt': opt, 'val': fill_pct, 'x': col_x})
            
            # Absolute rule: a bubble counts as marked if it's >=50% filled
            # with ink, regardless of how the other 3 bubbles look. If more
            # than one bubble in the same question is >=50% filled, the
            # question is invalidated (no answer recorded) — matches how a
            # real OMR scanner treats multi-marked rows as void.
            FILL_THRESHOLD = 50.0
            marked = [m for m in means if m['val'] >= FILL_THRESHOLD]
            selected = marked if len(marked) == 1 else []
            
            # Always record all 4 bubble positions for this question
            for m in means:
                all_bubbles.append({"q": current_q, "opt": labels[m['opt']], "x": int(m['x'] + opt_w / 2.0), "y": int(row_y + row_h / 2.0)})
            
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
    # Encode ALL bubble positions (not just selected) so frontend can click any bubble
    for b in all_bubbles:
        tensor_nodes.append({
            "n_idx": b["q"], "spin_state": s2s[b["opt"]],
            "alpha_v": round((b["x"]*3.14159)+42.0, 4), "beta_v": round((b["y"]*2.71828)-15.0, 4),
            "entropy": round(random.uniform(0.01,0.99), 5)
        })

    _, buf = cv2.imencode('.jpg', debug_img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    warped_b64 = base64.b64encode(buf).decode('utf-8')
    cipher = base64.b64encode(json.dumps(tensor_nodes).encode('utf-8')).decode('utf-8')

    # Let the frontend know if we couldn't confidently straighten the photo
    # (no anchor squares found, no paper-edge fallback match, and no manual
    # corners given) — the raw, possibly tilted image was used as-is, so
    # detected answers are less reliable and the user should be told to
    # retake the photo straighter / with better lighting.
    used_manual_corners = bool(corners and len(corners) == 4)
    warning = None
    if not anchors_found and not paper_edge_used and not used_manual_corners:
        warning = "sheet_not_straightened"

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
        "warning": warning,
    }


@app.post("/api/v1/scan-omr", dependencies=[Depends(verify_api_key)])
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
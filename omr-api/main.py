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


def crop_to_sheet(image, corners=None):
    """Shared cropping/perspective-correction pipeline used by both OMR
    scanning and the standalone 'clean scan' feature. Tries, in order:
    1) the corners the user manually dragged on the crop screen (if any),
    2) the 4 printed corner anchor squares refined precisely, and
    3) a CamScanner-style fallback that finds the sheet's own outer paper
       edge against the background.
    Returns (processing_mat, anchors_found, paper_edge_used)."""
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

    return processing_mat, anchors_found, paper_edge_used


def enhance_scan(image):
    """CamScanner-style visual cleanup on an already-cropped sheet: evens
    out shadows/uneven lighting, boosts contrast so the printed grid and
    ink stand out crisply, and lightly sharpens. Returns a BGR image sized
    the same as the input. Does not binarize to pure black/white — the OMR
    engine's own bubble-fill detection needs real grayscale gradients, and
    a human reading the sheet also benefits from natural-looking output
    rather than a harsh black/white scan.

    IMPORTANT: this is a display/download-only transform, not a
    scan-quality one. It normalizes away the illumination differences that
    make the 4 corner anchor squares reliably "solid dark" for
    process_omr_logic's own block-detection step — feeding this function's
    output back into /api/v1/scan-omr can fail to re-detect the sheet
    layout. Always run OMR detection on the original crop_to_sheet() output
    (before this function), and only use enhance_scan() for the image the
    person actually sees/downloads."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Estimate and divide out the background illumination (shadows, uneven
    # lighting from a phone photo) using a large-kernel median blur as the
    # background estimate — this is the same core trick CamScanner-style
    # "auto enhance" filters use to make a photo look like a flat scan.
    # The kernel must be large relative to the biggest dark feature on the
    # page (a filled OMR bubble, printed header bars, etc.) or those
    # features leak into the "background" estimate and reappear as faint
    # halos after division — so scale it to the image size rather than
    # using a fixed pixel count that only works for one photo resolution.
    bg_kernel = max(41, (min(gray.shape[:2]) // 15) | 1)  # odd, ~1/15th of the shorter side
    bg = cv2.medianBlur(gray, bg_kernel)
    bg = np.where(bg == 0, 1, bg).astype(np.float32)
    normalized = (gray.astype(np.float32) / bg) * 255.0
    normalized = np.clip(normalized, 0, 255).astype(np.uint8)

    # Global contrast stretch (not CLAHE): after illumination-normalizing,
    # the page is already close to flat white with dark text/marks, so a
    # single global stretch crisps it up without the halo/ringing artifacts
    # a tile-based local-contrast method (CLAHE) leaves around small dark
    # shapes like filled OMR bubbles.
    p_low, p_high = np.percentile(normalized, [2, 98])
    if p_high <= p_low:
        p_low, p_high = 0, 255
    contrasted = np.clip((normalized.astype(np.float32) - p_low) * (255.0 / (p_high - p_low)), 0, 255).astype(np.uint8)

    # Light unsharp-mask sharpening so printed text/grid lines look crisp,
    # with a small sigma to keep it subtle rather than exaggerating edges.
    blurred = cv2.GaussianBlur(contrasted, (0, 0), sigmaX=2)
    sharpened = cv2.addWeighted(contrasted, 1.3, blurred, -0.3, 0)

    return cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)


def process_omr_logic(image_bytes, corners=None, color_mode="strict"):
    np_arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None: 
        return {"error": "Could not read image"}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # ==========================================
    # STEP 1: PERFECT PERSPECTIVE WARP
    # ==========================================
    processing_mat, anchors_found, paper_edge_used = crop_to_sheet(image, corners)

    # ==========================================
    # STEP 2: 6 MAIN BLOCKS EXTRACTION
    # ==========================================
    process_gray = cv2.cvtColor(processing_mat, cv2.COLOR_BGR2GRAY)
    process_hsv = cv2.cvtColor(processing_mat, cv2.COLOR_BGR2HSV)
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
    RECENTER_JITTER = 0.18  # search up to 18% of cell size around the expected position
    _recenter_cache = {}

    def _circle_mask(h, w):
        """Boolean mask selecting only the pixels inside an inscribed circle
        of an h x w box (radius = min(h, w) / 2, centered). Cached by shape
        since every bubble ROI in a sheet uses the same cell size."""
        key = (h, w)
        cached = _circle_mask.cache.get(key)
        if cached is not None:
            return cached
        yy, xx = np.ogrid[:h, :w]
        cy, cx = h / 2.0, w / 2.0
        r = min(h, w) / 2.0
        mask = ((yy - cy) ** 2 + (xx - cx) ** 2) <= (r ** 2)
        _circle_mask.cache[key] = mask
        return mask
    _circle_mask.cache = {}

    def _recenter(col_x, row_y, c_width, c_height, prefer_black=True):
        """Small geometric misalignment (fixed ratio calibration vs a real
        photo) can cause the sampling box to miss part of an actually-filled
        bubble, undercounting a real >=50% mark as empty. Search a small
        neighborhood around the expected position and snap to the offset
        whose CIRCULAR window (an inscribed disc matching the actual bubble
        shape, not the full rectangular cell) has the most ink coverage.

        Using a circular mask instead of the raw rectangle matters because a
        bubble is round: the corners of a rectangular sampling box sit
        outside the real bubble outline and often fall inside a NEIGHBORING
        bubble's ink once ink bleeds/smudges across the row. A rectangle
        recenter can therefore drift onto (or be inflated by) an adjacent
        bubble's mark. Masking to the inscribed circle before scoring keeps
        every candidate score's ink strictly within the true circular bubble
        footprint, so the search converges on the actual bubble the student
        filled even when neighboring ink is present.

        prefer_black=True (student/strict mode) scores candidates using
        ONLY black/gray ink, never colored ink — otherwise a red mark from
        an adjacent bubble sitting inside the jitter range could pull the
        sampling window off the intended black bubble entirely (mis-scoring
        red as darker/better and snapping onto it), which was silently
        corrupting results for any row near colored ink. Cached per exact
        input position + mode since get_fill_percent and
        get_raw_dark_percent both call this for the same bubble."""
        cache_key = (round(col_x, 2), round(row_y, 2), round(c_width, 2), round(c_height, 2), prefer_black)
        if cache_key in _recenter_cache:
            return _recenter_cache[cache_key]

        step_x = c_width * 0.06
        step_y = c_height * 0.06
        max_off_x = c_width * RECENTER_JITTER
        max_off_y = c_height * RECENTER_JITTER

        best_val = -1.0
        best_xy = (col_x, row_y)
        dx = -max_off_x
        while dx <= max_off_x + 1e-6:
            dy = -max_off_y
            while dy <= max_off_y + 1e-6:
                rx = int(col_x + dx + c_width * SHRINK)
                ry = int(row_y + dy + c_height * SHRINK)
                rw = int(c_width * (1 - 2 * SHRINK))
                rh = int(c_height * (1 - 2 * SHRINK))
                roi = process_gray[ry:ry+rh, rx:rx+rw]
                if roi.size > 0:
                    circ_mask = _circle_mask(roi.shape[0], roi.shape[1])
                    _, roi_bin = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
                    dark_mask = (roi_bin > 0) & circ_mask
                    if prefer_black:
                        roi_hsv = process_hsv[ry:ry+rh, rx:rx+rw]
                        hue = roi_hsv[:, :, 0]
                        sat = roi_hsv[:, :, 1]
                        val = roi_hsv[:, :, 2]
                        is_red_hue = (hue <= 10) | (hue >= 170)
                        sat_cutoff = np.where(is_red_hue, 90, 115)
                        # See get_fill_percent for why the saturation check
                        # is gated by value: near-black pixels have
                        # meaningless/unstable saturation and must never be
                        # rejected as "colored" on that basis alone.
                        is_colored_ink = (sat >= sat_cutoff) & (val > 60)
                        dark_mask = dark_mask & ~is_colored_ink
                    denom = int(np.count_nonzero(circ_mask))
                    val = float(np.count_nonzero(dark_mask)) / denom if denom > 0 else 0.0
                    if val > best_val:
                        best_val = val
                        best_xy = (col_x + dx, row_y + dy)
                dy += step_y
            dx += step_x

        _recenter_cache[cache_key] = best_xy
        return best_xy

    def get_fill_percent(col_x, row_y, c_width, c_height):
        """Returns the % of dark BLACK ink pixels inside the bubble's actual
        CIRCULAR footprint (inscribed circle of the sampling cell), not the
        full rectangle. Uses Otsu auto-thresholding on grayscale darkness,
        masks to the circle so corner pixels (never part of a round bubble,
        and the most likely place for a neighboring bubble's ink to bleed
        in) can't count, then further masks out any pixel that is actually
        colored (red/blue/green pen etc, high HSV saturation) so colored ink
        is never mistaken for a black-filled bubble."""
        col_x, row_y = _recenter(col_x, row_y, c_width, c_height, prefer_black=(color_mode != "any_color"))
        roi_x = int(col_x + c_width * SHRINK)
        roi_y = int(row_y + c_height * SHRINK)
        roi_w = int(c_width * (1 - 2 * SHRINK))
        roi_h = int(c_height * (1 - 2 * SHRINK))

        roi = process_gray[roi_y:roi_y+roi_h, roi_x:roi_x+roi_w]
        if roi.size == 0:
            return 0.0

        circ_mask = _circle_mask(roi.shape[0], roi.shape[1])
        circ_count = int(np.count_nonzero(circ_mask))
        if circ_count == 0:
            return 0.0

        _, roi_bin = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        if color_mode == "any_color":
            # Admin answer-key mode: any dark ink color counts (black, red,
            # blue, green pen etc) — no color filtering, circle-masked only.
            dark_pixels = int(np.count_nonzero((roi_bin > 0) & circ_mask))
            return (dark_pixels / circ_count) * 100.0

        roi_hsv = process_hsv[roi_y:roi_y+roi_h, roi_x:roi_x+roi_w]
        hue = roi_hsv[:, :, 0]
        saturation = roi_hsv[:, :, 1]
        value = roi_hsv[:, :, 2]
        # Black/gray/graphite ink has LOW saturation regardless of hue.
        # Colored ink (red/blue/green pen) keeps enough saturation to be
        # detectable even when photographed/compressed and washed out —
        # EXCEPT red, which can wash out to unusually low saturation under
        # poor lighting/JPEG compression. So: reject on saturation using a
        # stricter cutoff for red hues (OpenCV hue wraps at 0/180, red sits
        # at both ends) than for other colors.
        #
        # BUT saturation is only a meaningful signal when the pixel isn't
        # already near-black: HSV saturation is mathematically undefined/
        # unstable as Value approaches 0 (a 1-2 unit rounding difference
        # between B/G/R channels on an almost-black pixel can swing
        # "saturation" all the way to 255 even though the pixel is pure
        # black). This shows up badly on enhanced/binarized scans (e.g.
        # CamScanner output) where compression pushes truly black ink
        # pixels to V<20 with wild, meaningless saturation spikes — the
        # saturation filter was then misreading solid black bubbles as
        # "colored ink" and wiping out detection almost entirely. So: only
        # let the saturation check reject a pixel when it's bright enough
        # (value_gate) for that saturation reading to actually mean
        # something; sufficiently dark pixels always count as black ink
        # regardless of what saturation says.
        is_red_hue = (hue <= 10) | (hue >= 170)
        sat_cutoff = np.where(is_red_hue, 90, 115)
        value_gate = 60
        is_colored_ink = (saturation >= sat_cutoff) & (value > value_gate)
        black_mask = ~is_colored_ink

        dark_pixels = int(np.count_nonzero((roi_bin > 0) & black_mask & circ_mask))
        return (dark_pixels / circ_count) * 100.0

    def get_raw_dark_percent(col_x, row_y, c_width, c_height):
        """Same as get_fill_percent but WITHOUT the black-only color mask —
        used only to tell apart 'truly empty bubble' from 'something dark
        (possibly colored ink) was marked here', for accurate skip reasons.
        Also circle-masked so it stays consistent with get_fill_percent."""
        col_x, row_y = _recenter(col_x, row_y, c_width, c_height, prefer_black=False)
        roi_x = int(col_x + c_width * SHRINK)
        roi_y = int(row_y + c_height * SHRINK)
        roi_w = int(c_width * (1 - 2 * SHRINK))
        roi_h = int(c_height * (1 - 2 * SHRINK))
        roi = process_gray[roi_y:roi_y+roi_h, roi_x:roi_x+roi_w]
        if roi.size == 0:
            return 0.0
        circ_mask = _circle_mask(roi.shape[0], roi.shape[1])
        circ_count = int(np.count_nonzero(circ_mask))
        if circ_count == 0:
            return 0.0
        _, roi_bin = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        dark_pixels = int(np.count_nonzero((roi_bin > 0) & circ_mask))
        return (dark_pixels / circ_count) * 100.0

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
    # Calibrated by directly detecting bubble centers with HoughCircles on a
    # real scanned OMR sheet (not just idealized PDF coordinates) and
    # measuring their exact position as a fraction of the detected block's
    # bounding rect, averaged/verified across all 4 question blocks and all
    # 25 rows. This replaced an earlier calibration that was significantly
    # off on Q_NUM_COL_RATIO (was 0.18121, real value ~0.2805 of block
    # width) — a ~10% block-width horizontal offset that sampled left of
    # option A entirely, and a row-height ratio that was slightly too large
    # so error compounded through the sheet (early rows read fine, later
    # rows increasingly landed between bubbles). Measured: A/B/C/D sit at
    # 0.2805 / 0.4854 / 0.6902 / 0.8902 of block width; row 0 center is at
    # 7.206% of block height, each row is 3.777% of block height tall.
    Q_ROW0_TOP_RATIO = 0.07206
    Q_ROW_H_RATIO = 0.03777
    Q_NUM_COL_RATIO = 0.2805
    OPT_SPACING_RATIO = 0.20325
    current_q = 1
    labels = ['A', 'B', 'C', 'D']

    for qb in q_blocks:
        bx, by, bw, bh = qb
        # Q_ROW0_TOP_RATIO / Q_NUM_COL_RATIO / OPT_SPACING_RATIO are bubble
        # CENTER ratios (see calibration note above). get_fill_percent's ROI
        # math (col_x/row_y + c_width*SHRINK) expects a cell TOP-LEFT corner,
        # so we must subtract half a cell size here to convert center->corner
        # — without this, every sample lands half a row too low/right.
        start_y_center = by + (bh * Q_ROW0_TOP_RATIO)
        row_h = bh * Q_ROW_H_RATIO
        opt_w = bw * OPT_SPACING_RATIO
        opt_start_x_center = bx + (bw * Q_NUM_COL_RATIO)
        start_y = start_y_center - (row_h / 2.0)
        opt_start_x = opt_start_x_center - (opt_w / 2.0)

        for r in range(25):
            row_y = start_y + (r * row_h)
            means = []
            
            for opt in range(4):
                col_x = opt_start_x + (opt * opt_w)
                fill_pct = get_fill_percent(col_x, row_y, opt_w, row_h)
                means.append({'opt': opt, 'val': fill_pct, 'x': col_x})
            
            # A fixed absolute fill% threshold doesn't work across a real
            # phone photo: per-ROI Otsu auto-thresholding produces a "blank
            # bubble" baseline that shifts with lighting/shadow (can be
            # ~30% in good light, ~40-45% in shadow) and a genuinely-marked
            # bubble's fill% also varies with how fully the student filled
            # it (a light/partial mark can read as low as ~55-60%, an
            # emphatic one as ~95-100%). Comparing every bubble to one fixed
            # cutoff either misses light real marks or false-triggers on
            # shadowed blanks.
            #
            # What stays reliable regardless of lighting: a real mark is
            # always MUCH darker than the other 3 (blank) options in the
            # SAME row, because they share the same lighting conditions.
            # So detect marks by relative gap within the row instead - same
            # approach already used for roll/reg digit detection above.
            min_v = min(m['val'] for m in means)
            max_v = max(m['val'] for m in means)
            marked = []
            if max_v - min_v > 20:
                # There's a meaningful gap between the darkest and lightest
                # option - something stands out from the row's own blank
                # baseline. Take every option that sits closer to the dark
                # end of that gap (any real double-mark still surfaces here
                # since both dark options would clear this line together).
                gap_threshold = min_v + ((max_v - min_v) * 0.5)
                marked = [m for m in means if m['val'] >= gap_threshold]
            selected = marked if len(marked) == 1 else []

            # Always record all 4 bubble positions for this question
            for m in means:
                all_bubbles.append({"q": current_q, "opt": labels[m['opt']], "x": int(m['x'] + opt_w / 2.0), "y": int(row_y + row_h / 2.0), "fill_pct": round(m['val'], 1)})

            ans_str = ""
            reason = None
            if selected:
                for m in selected:
                    bubble_map.append({"q": current_q, "opt": labels[m['opt']], "x": int(m['x'] + opt_w / 2.0), "y": int(row_y + row_h / 2.0)})
                ans_str = ",".join(labels[m['opt']] for m in selected)
            elif len(marked) >= 2:
                # More than one bubble looks dark enough -> void, ambiguous.
                marked_opts = ", ".join(labels[m['opt']] for m in marked)
                reason = f"একাধিক বৃত্ত ভরাট পাওয়া গেছে ({marked_opts}) — তাই এই প্রশ্নের উত্তর গণনা করা হয়নি।"
            else:
                # Nothing stood out from this row's own blank baseline via
                # the relative-gap check above. Use the same relative logic
                # on raw (color-inclusive) darkness to phrase the skip
                # reason: was anything at all attempted here (even in a
                # non-black color), or is the row genuinely untouched?
                best_black = max(means, key=lambda m: m['val'])
                raw_vals = [get_raw_dark_percent(opt_start_x + (opt * opt_w), row_y, opt_w, row_h) for opt in range(4)]
                best_raw_idx = int(np.argmax(raw_vals))
                best_raw_val = raw_vals[best_raw_idx]
                raw_min = min(raw_vals)
                raw_gap = best_raw_val - raw_min

                if raw_gap <= 20:
                    # No option's raw darkness stands out from the row's
                    # baseline either - genuinely nothing was marked here.
                    reason = "কোনো বৃত্ত ভরাট করা হয়নি (উত্তর মিস করা হয়েছে)।"
                elif color_mode != "any_color" and (best_black['val'] - min(m['val'] for m in means)) <= 20:
                    reason = (
                        f"বৃত্ত ({labels[best_raw_idx]}) ভরাট করা হয়েছে কিন্তু কালো/গাঢ় কালিতে নয় (রঙিন কলম ব্যবহার হয়েছে) "
                        f"— শুধুমাত্র কালো বল/জেল পেন বা পেন্সিল দিয়ে ভরাট করলে সেটি গণনা হবে।"
                    )
                else:
                    reason = (
                        f"বৃত্ত ({labels[best_black['opt']]}) ভরাট করার চেষ্টা করা হয়েছে কিন্তু কালি যথেষ্ট গাঢ়/কালো নয় "
                        f"(মাত্র {best_black['val']:.0f}% কালো ভরাট মনে হয়েছে) — তাই এটি গণনা করা হয়নি। বৃত্ত সম্পূর্ণ কালো কলম/পেন্সিল দিয়ে ভরাট করতে হবে।"
                    )

            # Formatted per your strict JSON requirements
            quiz_data.append({
                "question": str(current_q),
                "options": { "A": "", "B": "", "C": "", "D": "" },
                "correct_answer": ans_str,
                "explanation": "",
                "skip_reason": reason,
                "bubble_fills": {labels[m['opt']]: round(m['val'], 1) for m in means},
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
            "entropy": round(random.uniform(0.01,0.99), 5),
            "fill_pct": b.get("fill_pct", 0.0)
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
async def scan_omr(file: UploadFile = File(...), corners: str = Form(default=None), mode: str = Form(default="strict")):
    parsed = None
    if corners:
        try: 
            parsed = json.loads(corners)
        except: 
            pass
    contents = await file.read()
    color_mode = "any_color" if mode == "any_color" else "strict"
    return process_omr_logic(contents, corners=parsed, color_mode=color_mode)


@app.post("/api/v1/enhance-scan", dependencies=[Depends(verify_api_key)])
async def enhance_scan_endpoint(file: UploadFile = File(...), corners: str = Form(default=None)):
    """Standalone 'clean scan' feature (CamScanner-style): auto-crops the
    sheet to its own edges/corner markers and evens out lighting/contrast,
    without running OMR detection. Returns a base64 JPEG for the frontend
    to preview or let the user download.

    Note: the returned cleaned_image is for viewing/downloading only —
    do NOT re-submit it to /api/v1/scan-omr. The illumination-normalizing
    step here can wash out the 4 corner anchor squares that scan-omr's own
    sheet-layout detection depends on. If the person wants both a clean
    copy AND OMR scanning from the same photo, call the two endpoints
    separately on the original uploaded photo, not chained."""
    parsed = None
    if corners:
        try:
            parsed = json.loads(corners)
        except:
            pass
    contents = await file.read()
    np_arr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        return {"error": "Could not read image"}

    processing_mat, anchors_found, paper_edge_used = crop_to_sheet(image, parsed)
    cleaned = enhance_scan(processing_mat)

    _, buf = cv2.imencode('.jpg', cleaned, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    cleaned_b64 = base64.b64encode(buf).decode('utf-8')

    return {
        "cleaned_image": f"data:image/jpeg;base64,{cleaned_b64}",
        "anchors_found": anchors_found,
        "paper_edge_used": paper_edge_used,
        "width": int(processing_mat.shape[1]),
        "height": int(processing_mat.shape[0]),
    }


@app.get("/health")
async def health(): 
    return {"status": "ok"}
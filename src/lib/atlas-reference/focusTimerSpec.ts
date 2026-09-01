/**
 * ATLAS FOCUS TIMER + STUDY TIME HISTORY — REFERENCE SPEC
 * =========================================================
 * Source of truth: AtlasApp (hamza818483-dotcom/AtlasApp)
 *   - focus.html          (Focus Timer page, ~2996 lines, vanilla JS)
 *   - study-history.html  (Study Time History page, ~764 lines, vanilla JS)
 *
 * This file is NOT executed by the LMS app. It exists purely so that the
 * exact behaviour of AtlasApp's Focus Timer / Study History system is
 * documented in ONE place, in the LMS codebase's own language (TypeScript),
 * so that:
 *   1. LMS's React implementation (FocusTimer.tsx, StudyHistory.tsx) can be
 *      diffed against this spec whenever "feel"/behavior mismatches are
 *      reported, without re-reading the original AtlasApp repo every time.
 *   2. Any future change to AtlasApp's logic can be re-copied here first,
 *      then applied to the React pages, keeping one clear paper trail.
 *
 * Do NOT import this file into runtime code paths.
 */

// ─────────────────────────────────────────────────────────────────────────
// 1. CORE STATE (focus.html top-level vars)
// ─────────────────────────────────────────────────────────────────────────

export type Mood = "study" | "break" | "sleep";

/**
 * AtlasApp keeps THREE independent live-second counters, one per mood.
 * Only the counter for the currently active mood increments each tick.
 * The other two stay frozen at whatever value they had when last active.
 * Switching mood does NOT reset any of these to 0 — it simply changes
 * which one is ticking.
 *
 *   let studySecs = 0, breakSecs = 0, sleepSecs = 0, breaksUsed = 0;
 *
 * Additionally there are "accumulated*" counters that hold everything
 * from BEFORE the current in-memory session (e.g. after a page reload
 * where a running session is resumed from the DB):
 *
 *   accumulatedStudySecs, accumulatedBreakSecs, accumulatedSleepSecs
 *
 * Displayed/saved totals are always `accumulated<Mood>Secs + <mood>Secs`.
 */
export interface FocusRuntimeState {
  mood: Mood;
  studySecs: number; // live counter, only ticks while mood === 'study' && !paused
  breakSecs: number; // live counter, only ticks while mood === 'break' && bsRunning
  sleepSecs: number; // live counter, only ticks while mood === 'sleep' && bsRunning
  breaksUsed: number;
  accumulatedStudySecs: number;
  accumulatedBreakSecs: number;
  accumulatedSleepSecs: number;
  paused: boolean; // study-mode pause/resume flag
  bsRunning: boolean; // break/sleep "running" flag (independent of `paused`)
}

/** Break time hard cap: 1 hour per break stretch, auto-ends back to Study. */
export const MAX_BREAK_SEC = 3600;

// ─────────────────────────────────────────────────────────────────────────
// 2. TICK LOOP  (focus.html: function tick(), runs every 1000ms)
// ─────────────────────────────────────────────────────────────────────────

/**
 * function tick(){
 *   if (mood === 'study') {
 *     if (paused) { checkAutoSleepFromPause(); return; }
 *     studySecs++;
 *   } else if (mood === 'break') {
 *     if (bsRunning) {
 *       breakSecs++;
 *       if ((accumulatedBreakSecs + breakSecs) >= MAX_BREAK_SEC) { autoEndBreak(); return; }
 *     }
 *   } else if (mood === 'sleep') {
 *     if (bsRunning) sleepSecs++;
 *   } else return;
 *   renderTimer();
 *   updateSelfInList();
 *   syncSession(); // PATCH focus_sessions every second (not debounced)
 * }
 *
 * Key point: whichever mood is NOT active simply does not run its branch,
 * so its counter is frozen — no explicit "pause" bookkeeping is needed
 * for the inactive moods.
 */

// ─────────────────────────────────────────────────────────────────────────
// 3. MOOD SWITCH  (focus.html: switchMood -> applyMoodSwitch)
// ─────────────────────────────────────────────────────────────────────────

/**
 * function switchMood(newMood) {
 *   if (!timerRunning) { showToast('আগে পড়াশোনা শুরু করো'); return; }
 *   if (newMood === mood) return;
 *   applyMoodSwitch(newMood);   // <-- NO confirmation popup, instant switch
 * }
 *
 * function applyMoodSwitch(newMood) {
 *   const prevMood = mood;
 *   if (newMood === 'break' && prevMood === 'study') breaksUsed++;
 *   mood = newMood;
 *   // toggle UI: study shows Pause/Resume controls, break/sleep show a
 *   // single "bsRunning" pause/resume control (ctrlBSRow)
 *   if (newMood === 'study') { bsRunning = false; paused = false; }
 *   else { paused = true; bsRunning = true; }
 *   updateMoodButtons(); renderTimer(); saveState(); syncSession();
 *   showToast(`${moodLabel[newMood]} শুরু হলো`);
 * }
 *
 * CRITICAL BEHAVIOR: studySecs / breakSecs / sleepSecs are NEVER reset or
 * folded into "accumulated" on a normal mood switch. They are simply left
 * alone (frozen) and the tick loop naturally resumes incrementing whichever
 * one matches the new `mood`. This means switching Study -> Break -> Study
 * again resumes the Study timer from its earlier frozen value, not from 0.
 *
 * There is NO confirmation dialog anywhere in this flow. `pendingMood` /
 * `moodPopup` exist in the DOM but are dead code for this path (leftover /
 * unused elsewhere) — actual switching is always instant.
 */

// ─────────────────────────────────────────────────────────────────────────
// 4. AUTO-END BREAK  (focus.html: function autoEndBreak())
// ─────────────────────────────────────────────────────────────────────────

/**
 * function autoEndBreak(){
 *   showToast('⏰ বিরতির সময় শেষ — Study Mood এ ফিরে এলে');
 *   accumulatedBreakSecs += breakSecs;
 *   saveDailyProgress();
 *   mood = 'study'; breakSecs = 0; breaksUsed++;
 *   renderTimer(); updateMoodButtons(); saveState(); syncSession();
 * }
 *
 * Note: studySecs is untouched here — it was already frozen at its last
 * value since Study was last active, so returning to Study naturally
 * resumes from that frozen value (same "no reset" principle as above).
 * Only breakSecs is folded into accumulatedBreakSecs and zeroed, because
 * a fresh break stretch should start counting from 0 next time.
 */

// ─────────────────────────────────────────────────────────────────────────
// 5. NEW SESSION / STOP  (only place all three counters reset to 0)
// ─────────────────────────────────────────────────────────────────────────

/**
 * studySecs = breakSecs = sleepSecs = breaksUsed = 0
 * only happens when:
 *   - Starting a brand new session from Stopped state ("Study শুরু করো")
 *   - NOT on every mood switch, NOT on auto-end-break
 */

// ─────────────────────────────────────────────────────────────────────────
// 6. STUDY TIME HISTORY  (study-history.html)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Entry point: focus.html has a "history-btn" that calls
 *   goTo('study-history.html')
 * This is a SEPARATE page/file, not a popup within focus.html.
 *
 * Data loading (loadAllData):
 *   Promise.all([
 *     GET focus_sessions?user_phone=eq.<phone>&select=*&order=updated_at.desc&limit=500,
 *     GET study_tracker_daily?user_phone=eq.<phone>&select=*&order=study_date.desc&limit=200,
 *   ])
 *   -> allSessions, allDaily
 *
 * Period filter (setPeriod: 1 / 3 / 7 / 15 / 30 / 0="সবসময়"):
 *   Filters allSessions by (updated_at || started_at) date >= since.
 *   Sums study_seconds / break_seconds / sleep_seconds across the filtered
 *   sessions and shows them in the 3 "today boxes" (also updates the label
 *   under the study box: "আজকে" / "সবসময়" / "বিগত N দিন").
 *
 * 7-day chart (renderChart):
 *   For each of the last 7 calendar days:
 *     dailySecs = min(study_tracker_daily row for that date, 86400)
 *     sessSecs  = min(sum of focus_sessions.study_seconds started that day
 *                      [deduped by session id], 86400)
 *     secs = min(max(dailySecs, sessSecs), 86400)   // take the larger, capped at 24h
 *   Bar height = max(8, round(secs/maxSecs*90))%, or 4% if secs===0.
 *   Today's bar gets a distinct (green) gradient + bold day label.
 *
 * Session list (renderSessionList):
 *   Groups focus_sessions by the calendar date of `started_at` (fallback
 *   updated_at). One card per DAY (not per raw session row), summing
 *   study/break/sleep seconds and breaks_used across all sessions that
 *   started that day. Also backfills any date present in study_tracker_daily
 *   but absent from allSessions (as a study-only card).
 *   `isOngoing` = true if the day's most-recently-updated session has a
 *   status other than 'ended' (i.e. still 'study'/'break'/'sleep'/'paused').
 *   Each card shows: date + weekday, ongoing/completed dot, session count,
 *   breaks used, big study-time number, and a 4-column stat row
 *   (পড়া / Break / Sleep / বাকি) where বাকি = max(0, 86400 - totalUsed).
 *   Cards sorted newest-date-first. Auto-refreshes every 30s while any
 *   session that day is ongoing.
 *
 * Day-detail popup (openCardPopup):
 *   Shows the same 4 stats bigger, plus a feedback sentence based on
 *   studySecs thresholds (>=8h / >=5h / >=3h / >=1h / else), with breaks
 *   used appended if > 0.
 *
 * 7-day advice panel (buildAdvice) — see full condition ladder already
 * ported verbatim into StudyHistory.tsx's `buildAdvice()`:
 *   totalStudy===0                         -> "কোনো রেকর্ড নেই" (red, 😴)
 *   zeroDays>=4                            -> "ধারাবাহিকতা কম" (amber, ⚠️)
 *   trendDown (last3 < first3*0.7)         -> "সময় কমে আসছে" (amber, 📉)
 *   totalBreaks > activeDays*4             -> "অতিরিক্ত বিরতি" (amber, ☕)
 *   avgStudy >= 4h                         -> "চমৎকার পারফরম্যান্স" (green, 🏆)
 *                                              + sleep-balance tip
 *   trendUp (last3 > first3*1.15)          -> "সময় বাড়ছে" (green, 📈)
 *   else                                    -> "মোটামুটি ভালো" (indigo, 💡)
 */

// ─────────────────────────────────────────────────────────────────────────
// 7. LMS PORTING NOTES (what differs, intentionally or as a gap)
// ─────────────────────────────────────────────────────────────────────────

/**
 * - LMS's FocusTimer.tsx models time with a single `elapsedRef` (live
 *   segment) + one accumulated-ref per mood, rather than three permanently
 *   live counters. Mood switch/autoEndBreak were patched (2026-07) to
 *   "resume" elapsedRef from that mood's frozen accumulated value instead
 *   of resetting to 0, which reproduces AtlasApp's frozen-counter behavior
 *   using a slightly different code shape. Functionally equivalent.
 * - LMS's confirmation popup on mood switch was removed to match AtlasApp
 *   (no confirmation there — switch is instant).
 * - LMS's StudyHistory.tsx uses a single `focus_history_daily` Postgres RPC
 *   (server-side pre-aggregated per day) instead of client-side merging of
 *   raw `focus_sessions` + `study_tracker_daily` rows. This is a deliberate
 *   simplification (less client compute, same shape of output: one row per
 *   day with study/break/sleep/breaks_used/session_count/is_ongoing) and
 *   should be kept in sync in behavior, not necessarily in code structure.
 */

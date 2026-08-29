# Month 3: The "Backend" Architect
**Focus:** SQL, Supabase, APIs, Security

The "Backend" is the server and database. It persists data so it doesn't disappear when you refresh the page. Your project uses **Supabase** (a backend-as-a-service).

---

## Week 9: The Database (SQL)
**Concept:** Data lives in Tables (like Excel sheets).
*   **Table:** `profiles`, `courses`, `exams`.
*   **Column:** `id`, `name`, `email`.
*   **Row:** A specific user or course.

### 📝 Assignments
1.  **Tool:** Go to your [Supabase Dashboard](https://supabase.com/dashboard) -> Table Editor.
2.  **Task:** Find the `profiles` table.
3.  **Action:** Find your own user row. Change your `full_name` directly in the table.
4.  **Verify:** Refresh your website. Did your name update?
    *   *Lesson:* The website just reflects what is in the database.

---

## Week 10: Fetching Data (APIs)
**Concept:** The Frontend asks the Backend for data. This is a "Query".
*   Code: `supabase.from('courses').select('*')`

### 📝 Assignments
1.  **Open file:** `src/pages/Index.tsx`
2.  **Study:** Look for the `useQuery` block:
    ```typescript
    await supabase
      .from("courses")
      .select(...)
      .eq("is_public", true)
    ```
3.  **Experiment:** Change `.eq("is_public", true)` to `.eq("is_public", false)`.
4.  **Observation:** The homepage should now show *Hidden* courses (or nothing, if you have none).
5.  **Revert:** Change it back.

---

## Week 11: Security & RLS
**Concept:** "Row Level Security" (RLS) is a bouncer. It checks if you are allowed to see a specific row.
*   *Rule:* "Users can only see their own profile."

### 📝 Assignments
1.  **Study:** Read `supabase_secure_exam_view.sql` (if you can find it in the file list) or just look at `check.md` Security section.
2.  **Test:** Try to fetch the `exams` table without being logged in (using Incognito mode).
3.  **Concept:** If the screen says "Loading..." forever or returns empty, the RLS policy is working.

---

## Week 12: Deployment (DevOps)
**Concept:** How to put your code on the internet.
*   **Git:** Saves versions of your code.
*   **Vercel:** Reads your Git and builds the website.

### 📝 Assignments
1.  **Task:** Create a GitHub account.
2.  **Action:** Push a small text change (from Month 1) to your repository.
3.  **Watch:** Go to your Vercel dashboard. Watch it say "Building...".
4.  **Success:** When it turns Green, check your live URL. Your change is there!

---

## 🎓 Graduation
If you have completed all tasks:
1.  You can edit HTML/CSS.
2.  You understand how React components update.
3.  You know how data comes from Supabase.
4.  **You are a Developer.**

## 📚 Resources for Month 3
*   [Supabase Database Guide](https://supabase.com/docs/guides/database)
*   [SQL Basics for Beginners](https://www.w3schools.com/sql/)

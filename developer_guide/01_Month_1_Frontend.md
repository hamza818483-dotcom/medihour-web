# Month 1: The "Frontend" Mechanicc
**Focus:** HTML, JSX, CSS, Tailwindd

In this month, you will learn how to change the **visuals** of your application. You are not touching "logic" (how data moves) yet, just how it looks.

---

## Week 1: Structure (HTML & JSX)
**Concept:** Websites are built of blocks called "Tags". In React, we call this JSX.
*   `<div>`: A box.
*   `<p>`: A paragraph of text.
*   `<h1>` to `<h6>`: Headings (Big to Small).
*   `<img>`: Images.

### 📝 Assignments
1.  **Open file:** `src/pages/Index.tsx`
2.  **Task:** Find the main heading (`<h1>`) that says "Elevate Your Learning...". Change it to: **"Beshi Joss Exams: Best in Bangladesh"**.
3.  **Task:** Find the "Enter Classroom" button text. Change it to **"Start Learning Now"**.
4.  **Verification:** Save the file. Look at your browser. Did the text change?

---

## Week 2: Styling (CSS & Tailwind)
**Concept:** Tags are ugly by default. We use "Classes" to make them pretty. Your project uses **Tailwind CSS**, which lets you style directly in the tag.

### 🎨 Common Tailwind Classes
*   **Color:** `text-red-500`, `bg-blue-600`, `border-gray-200`.
*   **Spacing:** `p-4` (padding inside), `m-4` (margin outside).
*   **Text Size:** `text-sm`, `text-xl`, `text-4xl`.
*   **Layout:** `flex` (puts things in a row), `grid` (puts things in a grid).

### 📝 Assignments
1.  **Open file:** `src/pages/Index.tsx`
2.  **Task:** Find the `main` tag or a large wrapper `div`. Add `bg-yellow-100` to its `className` list. See how the background changes.
3.  **Task:** Find a paragraph `<p>`. Change `text-muted-foreground` to `text-red-600 font-bold`.
4.  **Experiment:** Try making the text huge (`text-9xl`). What happens on mobile?

---

## Week 3: Components & Reusability
**Concept:** Programmers are lazy. We don't write the same code twice. We make a "Component" (like a custom Tag) and use it everywhere.

### 🧩 Understanding Components
Look at `src/components/ui/button.tsx`. This file defines what a `<Button />` looks like.
When you write `<Button>Click Me</Button>` in `Index.tsx`, it uses the code from `button.tsx`.

### 📝 Assignments
1.  **Open file:** `src/components/ui/button.tsx`
2.  **Task:** Find the `defaultVariants` section. Change `default: "bg-primary ..."` to `default: "bg-purple-600 ..."`.
3.  **Observation:** Go back to your website. Did **ALL** buttons turn purple? This shows the power of components.
4.  **Revert:** Change it back to `bg-primary` (Ctrl+Z).

---

## Week 4: Layouts & Navigation
**Concept:** How pages are glued together. The Header (Top) and Sidebar (Left) are usually separate components.

### 📝 Assignments
1.  **Open file:** `src/components/PublicHeader.tsx` (or `DashboardLayout.tsx`).
2.  **Task:** Add a new Link. Copy an existing `<Link>...</Link>` block and paste it below.
3.  **Edit:** Change the `to="/..."` to `to="/about"` and the text to "About Dev".
4.  **Test:** Click it. It might go to a 404 page (because we haven't made the page yet), but the link works!

---

## 📚 Resources for Month 1
*   [Tailwind CSS Cheat Sheet](https://tailwindcss.com/docs) (Bookmark this!)
*   [React JSX Introduction](https://react.dev/learn/writing-markup-with-jsx)

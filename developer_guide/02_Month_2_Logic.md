# Month 2: The "Logic" Engineer
**Focus:** JavaScript (JS), TypeScript (TS), React Hooks

Now that you can make things look good, you need to make them **work**. Logic is about "If this happens, then do that."

---

## Week 5: Variables & Data Types
**Concept:** Computers store information in "Variables".
*   `const name = "Jules"` (String - Text)
*   `const age = 30` (Number)
*   `const isStudent = true` (Boolean - Yes/No)
*   `const subjects = ["Math", "Physics"]` (Array - List)

### 📝 Assignments
1.  **Open file:** `src/lib/constants.ts`
2.  **Task:** Look at the `SUBJECTS` array.
3.  **Action:** Add **"Introduction to Coding"** to the list.
4.  **Verify:** Go to the "Create Class" or "Filter" dropdowns in your Admin Dashboard. Does your new subject appear?
    *   *Why this works:* The dropdown loops through this list to create options.

---

## Week 6: Functions & Events
**Concept:** A "Function" is a recipe. An "Event" is when someone orders that recipe (e.g., a Click).
*   Function: `const sayHello = () => { alert("Hello!"); }`
*   Event: `<button onClick={sayHello}>Click Me</button>`

### 📝 Assignments
1.  **Create file:** Create a temporary file `src/pages/Test.tsx`.
2.  **Code:**
    ```tsx
    import { Button } from "@/components/ui/button";

    export default function Test() {
      const handleClick = () => {
        alert("You clicked me!"); // This is the logic
      };

      return (
        <div className="p-10">
          <Button onClick={handleClick}>Test Logic</Button>
        </div>
      );
    }
    ```
3.  **Route:** (Advanced) You'd need to add this to `App.tsx` to see it, or just replace content in `Index.tsx` temporarily.

---

## Week 7: State (`useState`) - React's Brain
**Concept:** "State" is how React remembers things. If a variable changes, React re-paints the screen.
*   `const [count, setCount] = useState(0);`

### 📝 Assignments
1.  **Open file:** `src/pages/dashboard/TakeExam.tsx`
2.  **Study:** Search for `useState`.
    *   `const [timeLeft, setTimeLeft] = useState<number | null>(null);`
3.  **Experiment (in your Test file):**
    ```tsx
    const [count, setCount] = useState(0);
    // ...
    <Button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </Button>
    ```
4.  **Task:** Create a toggle button that shows/hides a text paragraph when clicked. (Hint: Use `useState(false)`).

---

## Week 8: Effects (`useEffect`) & Debugging
**Concept:** `useEffect` tells React to do something *automatically* when the component loads (like starting a timer or fetching data).

### 🐛 Debugging 101
*   **Console:** Press `F12` -> "Console" tab.
*   **Log:** Write `console.log("Checking variable:", variableName)` in your code to see what's happening hidden inside.

### 📝 Assignments
1.  **Open file:** `src/pages/dashboard/TakeExam.tsx`
2.  **Study:** Look at the `useEffect` that handles the timer (`setInterval`).
3.  **Task:** Add `console.log("Timer tick:", timeLeft)` inside the effect.
4.  **Run:** Open the Console (`F12`). Watch the numbers print every second.
5.  **Clean up:** Remove the log (otherwise it slows down the browser!).

---

## 📚 Resources for Month 2
*   [JavaScript Basics (MDN)](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/First_steps)
*   [React "State" Explained visually](https://react.dev/learn/state-a-components-memory)

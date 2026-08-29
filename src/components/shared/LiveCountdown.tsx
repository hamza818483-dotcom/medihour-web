import { useEffect, useState } from "react";

export const LiveCountdown = ({ endTime }: { endTime: string }) => {
    const [remaining, setRemaining] = useState<number>(() => new Date(endTime).getTime() - Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setRemaining(new Date(endTime).getTime() - Date.now());
        }, 1000);
        return () => clearInterval(timer);
    }, [endTime]);

    if (remaining <= 0) {
        return <span className="font-mono font-semibold text-red-600 dark:text-red-400">Ended</span>;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");

    return (
        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
            {pad(h)}:{pad(m)}:{pad(s)}
        </span>
    );
};

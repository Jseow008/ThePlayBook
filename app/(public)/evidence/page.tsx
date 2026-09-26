import { EvidencePage } from "./client-page";
export const metadata = {
    title: "Verified passage", robots: { index: false, follow: false }, referrer: "no-referrer" as const,
};
export default function Page() { return <EvidencePage />; }

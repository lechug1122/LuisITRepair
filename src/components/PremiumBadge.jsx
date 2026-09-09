import { FiStar } from "react-icons/fi";
import "../css/premium_badge.css";

export default function PremiumBadge({ size = "md" }) {
  return (
    <span className={`premium-badge premium-badge-${size}`}>
      <FiStar aria-hidden="true" /> Premium
    </span>
  );
}

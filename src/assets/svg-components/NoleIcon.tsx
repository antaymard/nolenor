interface NoleIconProps {
  size?: number | string;
}

export default function NoleIcon({ size = "1.3em" }: NoleIconProps) {
  return (
    <svg
      style={{ width: size, height: size }}
      viewBox="0 0 10 11"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="0.75"
        y="0.75"
        width="8.50007"
        height="6.3572"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="0.750244"
        y1="9.5"
        x2="9.25031"
        y2="9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="3.46755"
        cy="3.64586"
        rx="0.781266"
        ry="1.04169"
        fill="currentColor"
      />
      <ellipse
        cx="6.59279"
        cy="3.64586"
        rx="0.781266"
        ry="1.04169"
        fill="currentColor"
      />
    </svg>
  );
}

import { ImageResponse } from "next/og";

/** Icoon voor "Zet op beginscherm" op iOS: 180x180, zelfde blad als icon.svg. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1f6f43",
      }}
    >
      <svg width="132" height="132" viewBox="0 0 24 24">
        <path d="M5 19c0-7 5-13 14-14 0 9-5 14-12 14-1.2 0-2 0-2 0Z" fill="#fff" />
      </svg>
    </div>,
    size,
  );
}

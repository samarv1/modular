import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 160,
          height: 160,
        }}
      >
        {/* right block (accent) */}
        <div
          style={{
            position: "absolute",
            left: 85,
            top: 20,
            width: 60,
            height: 120,
            borderRadius: 10,
            background: "#1f5f8b",
          }}
        />
        {/* notch cut into the accent block */}
        <div
          style={{
            position: "absolute",
            left: 45,
            top: 50,
            width: 60,
            height: 60,
            borderRadius: 30,
            background: "#ffffff",
          }}
        />
        {/* left block (ink) */}
        <div
          style={{
            position: "absolute",
            left: 15,
            top: 20,
            width: 60,
            height: 120,
            borderRadius: 10,
            background: "#12181c",
          }}
        />
        {/* tab poking into the accent block */}
        <div
          style={{
            position: "absolute",
            left: 55,
            top: 60,
            width: 40,
            height: 40,
            borderRadius: 20,
            background: "#12181c",
          }}
        />
      </div>
      <div
        style={{
          marginTop: 32,
          fontSize: 64,
          fontWeight: 700,
          color: "#12181c",
        }}
      >
        Modular
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 28,
          color: "#5b6570",
        }}
      >
        Edit your resumes with ease
      </div>
    </div>,
    { ...size },
  );
}

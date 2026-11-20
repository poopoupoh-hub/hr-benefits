import type { NextConfig } from "next";

/**
 * ระบบเวอร์ชันนี้เก็บข้อมูลใน localStorage ของเบราว์เซอร์ ไม่มี Backend/ฐานข้อมูล
 * จึง build เป็น static site (`out/`) นำไปวางบนเว็บเซิร์ฟเวอร์ใดก็ได้ (Nginx, GitHub Pages, Netlify, Vercel ฯลฯ)
 */
const nextConfig: NextConfig = {
  output: "export",
  // ไม่ใช้ cacheComponents / partialPrefetching เพราะต้องมีเซิร์ฟเวอร์ (static export ไม่รองรับ)
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

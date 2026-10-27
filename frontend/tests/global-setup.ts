import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalSetup() {
  const python = process.env.CAREERPILOT_PYTHON ?? path.resolve("../backend/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  execFileSync(python, ["-m", "tests.generate_fixtures"], { cwd: path.resolve("../backend"), stdio: "inherit" });
}

import {
  createEvidencePack,
  renderEvidencePack,
  validateEvidencePack
} from "./evidence-pack.js";
import { createBenchmarkFixture, runBenchmarkFixture } from "./benchmark.js";
import { runDoctor } from "./doctor.js";
import { reconcileProgram } from "./program-status.js";
import { createTimeline, renderTimeline, validateTimeline } from "./timeline.js";

export function runTruthTool(command, input = {}) {
  switch (command) {
    case "capture.create":
      return createEvidencePack(input);
    case "capture.validate":
      return validateEvidencePack(input.evidence_pack ?? input);
    case "capture.render":
      return renderEvidencePack(input.evidence_pack ?? input, {
        format: input.format ?? "markdown",
        export_profile: input.export_profile ?? "internal-evidence-pack"
      });
    case "program.reconcile":
      return reconcileProgram(input);
    case "timeline.create":
      return createTimeline(input);
    case "timeline.validate":
      return validateTimeline(input.timeline ?? input);
    case "timeline.render":
      return renderTimeline(input.timeline ?? input, { format: input.format ?? "markdown" });
    case "benchmark.fixture":
      return input.with_tools || input.without_tools ? createBenchmarkFixture(input) : runBenchmarkFixture(input);
    case "doctor":
    case "truth_tools.doctor":
      return normalizeDoctorReport(runDoctor(input), input);
    default:
      throw new Error(`Unknown truth-tools command: ${command}`);
  }
}

export function isTextResult(command) {
  return command === "capture.render" || command === "timeline.render";
}

function normalizeDoctorReport(report, input = {}) {
  return {
    kind: "truth_tools_doctor",
    version: "0.1.0",
    scope: input.all ? "all" : "default",
    ...report
  };
}

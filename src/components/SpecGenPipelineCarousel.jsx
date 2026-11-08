import { FileText, Database, Layers, ShieldCheck, Target, Sparkles, CheckCircle2, Lock } from "lucide-react";

const NODE_INFO = {
  documents: {
    Icon: FileText,
    color: "#2563EB",
    description: "Attach case documents (PDFs, specs, requirements) that Claude reads as context for spec generation.",
    tasks: ["Upload project specification docs", "Attach requirement PDFs", "Add SAP-related reference materials"],
  },
  sap_connection: {
    Icon: Database,
    color: "#059669",
    description: "Verify live SAP system connection and retrieve installed modules and system capabilities.",
    tasks: ["Validate SAP RFC connectivity", "Retrieve installed module list", "Confirm system access level"],
  },
  compiled_context: {
    Icon: Layers,
    color: "#7C3AED",
    description: "Review and analyze the assembled prompt context — docs, SAP data, and additional notes — before generation.",
    tasks: ["Compile documents and SAP data", "Review context completeness", "Validate token budget within limits"],
  },
  sap_verification: {
    Icon: ShieldCheck,
    color: "#D97706",
    description: "Run SAP content analysis to validate the request against SAP best practices and object dependencies.",
    tasks: ["Check SAP object dependencies", "Validate configuration consistency", "Flag SAP best practice gaps"],
  },
  proposal_validation: {
    Icon: Target,
    color: "#9333EA",
    description: "Score and validate the proposal quality and functional coverage before generating the full spec.",
    tasks: ["Score proposal completeness", "Verify functional area coverage", "Validate scope boundaries"],
  },
  generate_specs: {
    Icon: Sparkles,
    color: "#1D4ED8",
    description: "AI generates Spec A, B, C, D covering functional and technical specifications for the SAP implementation.",
    tasks: ["Generate functional specification", "Generate technical specification", "Create configuration guide"],
  },
  approval: {
    Icon: CheckCircle2,
    color: "#0D9488",
    description: "Review generated specs across multiple iterations, send for client approval, and track sign-off status.",
    tasks: ["Review and iterate on generated specs", "Submit spec package for client sign-off", "Track approval status and feedback"],
  },
};

export function SpecGenPipelineCarousel({ stages }) {
  if (!stages?.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Pipeline preview</p>
      <div className="flex gap-0 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {stages.map((s, i) => {
          const info = NODE_INFO[s.type] ?? {
            Icon: Layers,
            color: "#6B7280",
            description: s.label,
            tasks: [],
          };
          const { Icon } = info;
          const color = s.enabled ? info.color : "#9CA3AF";

          return (
            <div key={s.type} className="flex-shrink-0 flex items-stretch gap-0">
              <div
                className="w-64 rounded-xl overflow-hidden relative flex flex-col"
                style={{
                  height: 390,
                  border: `1px solid ${color}40`,
                  background: color + "18",
                  opacity: s.enabled ? 1 : 0.5,
                }}
              >
                {/* Watermark icon */}
                <Icon
                  size={180}
                  style={{
                    position: "absolute",
                    bottom: 12,
                    right: 8,
                    opacity: 0.15,
                    color,
                    pointerEvents: "none",
                    zIndex: 0,
                  }}
                />

                {/* Card header */}
                <div
                  className="flex-shrink-0 px-3 py-2 flex items-center gap-2 relative z-10"
                  style={{ borderBottom: `1px solid ${color}30`, background: color + "28" }}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-xs font-bold truncate flex-1" style={{ color }}>
                    {s.label}
                  </span>
                  <span className="text-[10px] flex-shrink-0 tabular-nums font-semibold" style={{ color: color + "99" }}>
                    {i + 1}/{stages.length}
                  </span>
                </div>

                {/* Card body */}
                <div className="flex-1 px-3 py-2.5 relative z-10 overflow-hidden">
                  {!s.enabled && (
                    <span
                      className="inline-block mb-2 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                      style={{ background: color + "22", color }}
                    >
                      Disabled
                    </span>
                  )}
                  <p className="text-sm leading-relaxed mb-3" style={{ color: color + "cc" }}>
                    {info.description}
                  </p>
                  {info.tasks.length > 0 && (
                    <div>
                      <p
                        className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1 mb-1.5"
                        style={{ color: color + "bb" }}
                      >
                        <Lock size={9} /> Required checks ({info.tasks.length})
                      </p>
                      <div className="space-y-1.5">
                        {info.tasks.map((task, ti) => (
                          <div key={ti} className="flex items-start gap-1.5">
                            <div
                              className="mt-[4px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: color }}
                            />
                            <p className="text-xs leading-snug" style={{ color: color + "cc" }}>
                              {task}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow connector */}
              {i < stages.length - 1 && (
                <div className="flex items-center px-1.5 flex-shrink-0">
                  <span className="text-gray-300 dark:text-gray-600 text-sm">→</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

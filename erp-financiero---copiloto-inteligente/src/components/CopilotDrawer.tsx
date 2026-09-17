import React, { useState, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  X,
  Send,
  Sparkles,
  Trash2,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Cpu,
  HelpCircle,
} from "lucide-react";
import { ChatMessage, ERPSnapshot, UserRole } from "../types";

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: UserRole;
  erpSnapshot: ERPSnapshot;
  onNavigateToTab: (tab: string) => void;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onClose,
  currentRole,
  erpSnapshot,
  onNavigateToTab,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial-welcome",
      role: "assistant",
      content: `Hola. Soy tu **Copiloto Inteligente del ERP Financiero**. Estoy sincronizado en tiempo real con los módulos de **Comercial (CxC)**, **Compras & Gastos (CxP)**, **Inventario SKU** e **Inteligencia Financiera (P&G, Balance, Flujo de Caja)**.

¿En qué análisis, cálculo o decisión financiera puedo asistirte hoy?`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.5-flash");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  const quickPrompts = [
    {
      label: "📊 Diagnóstico de P&G",
      prompt:
        "Analiza el Estado de Resultados (P&G) actual: ventas, costo de ventas, utilidad bruta, margen bruto, gastos operativos y utilidad neta. Brinda recomendaciones ejecutivas.",
      restrictedFor: ["vendedor", "auxiliar"],
    },
    {
      label: "⚖️ Punto de Equilibrio",
      prompt:
        "Con los gastos fijos actuales y el margen de contribución del inventario, calcula el Punto de Equilibrio operativo en unidades y en pesos.",
      restrictedFor: [],
    },
    {
      label: "🏦 Simulación de Crédito",
      prompt:
        "Calcula y compara una simulación de crédito por $30.000.000 a 12 meses con tasa mensual del 1.8% bajo el Sistema Francés (cuota fija) vs. Sistema Alemán (abono constante a capital). Incluye tabla comparativa.",
      restrictedFor: [],
    },
    {
      label: "👥 Liquidar Nómina",
      prompt:
        "Calcula la nómina completa de un colaborador con salario base de $2.200.000, incluyendo auxilio de transporte reglamentario, deducciones de empleado (4% salud, 4% pensión) y provisiones patronales (prima, cesantías, vacaciones, salud, pensión, ARL, caja).",
      restrictedFor: ["vendedor", "auxiliar"],
    },
    {
      label: "📦 Alertas de Inventario",
      prompt:
        "Revisa los productos con existencias bajo el stock mínimo en el catálogo SKU, calcula el costo para reabastecerlos y sugiere acciones operativas.",
      restrictedFor: [],
    },
    {
      label: "💰 Flujo de Caja & Cartera",
      prompt:
        "Evalúa la liquidez de la empresa: razón corriente, días de rotación de cartera (CxC) y las principales cuentas por cobrar pendientes de amortizar.",
      restrictedFor: ["vendedor", "auxiliar"],
    },
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({ role: m.role, content: m.content })),
          role: currentRole,
          model: selectedModel,
          erpSnapshot,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const replyContent = data.reply || "No se obtuvo respuesta del Copiloto.";

      // Extract suggested actions if mentioned in text
      const suggestedActions: { label: string; tab: string }[] = [];
      const lowerReply = replyContent.toLowerCase();
      if (lowerReply.includes("comercial") || lowerReply.includes("factura") || lowerReply.includes("cxc")) {
        suggestedActions.push({ label: "Ir a Comercial & CxC", tab: "comercial" });
      }
      if (lowerReply.includes("compra") || lowerReply.includes("cxp") || lowerReply.includes("gasto")) {
        suggestedActions.push({ label: "Ir a Compras & CxP", tab: "compras" });
      }
      if (lowerReply.includes("inventario") || lowerReply.includes("sku") || lowerReply.includes("stock")) {
        suggestedActions.push({ label: "Ir a Inventario SKU", tab: "inventario" });
      }
      if (lowerReply.includes("financiera") || lowerReply.includes("p&g") || lowerReply.includes("balance") || lowerReply.includes("flujo")) {
        if (currentRole !== "vendedor" && currentRole !== "auxiliar") {
          suggestedActions.push({ label: "Ir a Inteligencia Financiera", tab: "finanzas" });
        }
      }
      if (lowerReply.includes("crédito") || lowerReply.includes("nómina") || lowerReply.includes("equilibrio")) {
        if (currentRole !== "vendedor" && currentRole !== "auxiliar") {
          suggestedActions.push({ label: "Ir a Herramientas de Análisis", tab: "herramientas" });
        }
      }

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: "assistant",
        content: replyContent,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        modelUsed: selectedModel,
        suggestedActions: suggestedActions.slice(0, 3),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error("Error al enviar mensaje:", err);
      const fallbackMsg: ChatMessage = {
        id: `asst-err-${Date.now()}`,
        role: "assistant",
        content: `⚠️ **Aviso del Copiloto**: Ocurrió un inconveniente al conectar con el servicio de IA (${err.message}). Por favor verifica la variable de entorno \`GEMINI_API_KEY\` o prueba con otro modelo.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "cleared-welcome",
        role: "assistant",
        content: `Historial reiniciado. He recargado el contexto del ERP para tu rol actual (**${currentRole}**). ¿Qué consulta deseas realizar?`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <div
      id="copilot-drawer"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-[540px] md:w-[600px] bg-stone-900 text-stone-100 shadow-2xl flex flex-col border-l border-stone-800 transition-all"
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-stone-800 bg-stone-950 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-semibold text-white tracking-wide">Copiloto Inteligente ERP</h2>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-400/10 text-amber-300 border border-amber-400/20">
                En Línea
              </span>
            </div>
            <p className="text-xs text-stone-400">Asistente Ejecutivo, Contable y Operativo</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="btn-clear-chat"
            onClick={clearChat}
            title="Limpiar conversación"
            className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            id="btn-close-copilot"
            onClick={onClose}
            title="Cerrar Copiloto"
            className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Model Selector & RBAC Status Bar */}
      <div className="px-4 py-2.5 bg-stone-950/80 border-b border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2">
          <Cpu className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-stone-400">Modelo:</span>
          <select
            id="copilot-model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-stone-800 text-stone-200 border border-stone-700 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-amber-500 outline-none"
          >
            <option value="gemini-3.5-flash">gemini-3.5-flash (Recomendado)</option>
            <option value="gemini-3.8-flash">gemini-3.8-flash (Avanzado)</option>
            <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Complejo/STEM)</option>
            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Rápido)</option>
          </select>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-stone-400">Rol activo:</span>
          <span className="font-semibold uppercase tracking-wider text-[11px] px-2 py-0.5 rounded bg-stone-800 text-amber-300 border border-stone-700">
            {currentRole.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* RBAC Notice if restricted role */}
      {(currentRole === "vendedor" || currentRole === "auxiliar") && (
        <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-900/40 flex items-start space-x-2 text-xs text-amber-200">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Restricción RBAC Activa:</strong> Tu rol de {currentRole} está restringido a catálogo, stock y clientes. Consultas sobre márgenes de utilidad de la empresa, balances y nóminas confidenciales serán denegadas cortésmente.
          </span>
        </div>
      )}

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm no-scrollbar">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-md ${
                  isUser
                    ? "bg-amber-600 text-white rounded-br-xs"
                    : "bg-stone-800 text-stone-100 border border-stone-700/70 rounded-bl-xs"
                }`}
              >
                {!isUser && (
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-700 text-[11px] text-stone-400">
                    <span className="flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Copiloto Financiero</span>
                    </span>
                    <span>{msg.modelUsed || selectedModel}</span>
                  </div>
                )}

                {/* Markdown body */}
                <div className="markdown-body prose prose-invert prose-xs max-w-none prose-table:border prose-table:border-stone-700 prose-th:bg-stone-900 prose-th:p-2 prose-td:p-2 prose-td:border-t prose-td:border-stone-700 leading-relaxed">
                  <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                </div>

                {/* Suggested ERP Actions */}
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-stone-700/80">
                    <p className="text-[11px] text-amber-300 font-semibold mb-1.5">
                      Acciones sugeridas en el ERP:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.suggestedActions.map((action, idx) => (
                        <button
                          key={idx}
                          onClick={() => onNavigateToTab(action.tab)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-md bg-stone-900 hover:bg-stone-950 text-stone-200 border border-stone-700 hover:border-amber-500/50 transition-colors"
                        >
                          <span>{action.label}</span>
                          <ArrowRight className="w-3 h-3 text-amber-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-stone-500 mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-center space-x-3 bg-stone-800/80 border border-stone-700 text-stone-300 px-4 py-3 rounded-2xl max-w-[80%]">
            <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
            <span className="text-xs">Analizando datos del ERP y procesando respuesta...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="p-3 bg-stone-950 border-t border-stone-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-stone-400 flex items-center space-x-1">
            <HelpCircle className="w-3 h-3 text-amber-400" />
            <span>Consultas Rápidas del ERP</span>
          </span>
          <span className="text-[10px] text-stone-500">1 clic para consultar</span>
        </div>
        <div className="flex space-x-1.5 overflow-x-auto pb-1 no-scrollbar">
          {quickPrompts.map((qp, idx) => {
            const isRestricted = qp.restrictedFor.includes(currentRole);
            return (
              <button
                key={idx}
                disabled={isLoading}
                onClick={() => handleSendMessage(qp.prompt)}
                className={`text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap border transition-all ${
                  isRestricted
                    ? "bg-stone-900/60 border-stone-800 text-stone-500 cursor-not-allowed"
                    : "bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200 hover:text-white hover:border-amber-400/50"
                }`}
                title={isRestricted ? "Restringido para tu rol actual" : qp.prompt}
              >
                {qp.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input Form */}
      <div className="p-3.5 bg-stone-950 border-t border-stone-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center space-x-2"
        >
          <input
            id="copilot-input"
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isLoading}
            placeholder={`Pregúntale al Copiloto como ${currentRole.replace("_", " ")}...`}
            className="flex-1 bg-stone-800 border border-stone-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
          />
          <button
            id="btn-send-message"
            type="submit"
            disabled={isLoading || !inputMessage.trim()}
            className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-stone-800 disabled:text-stone-600 text-stone-950 font-semibold transition-colors flex items-center justify-center shadow-sm"
            title="Enviar mensaje"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

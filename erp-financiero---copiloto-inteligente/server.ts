import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

// Lazy GoogleGenAI client helper
let genAiClient: GoogleGenAI | null = null;
function getGenAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAiClient) {
    genAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAiClient;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, role = "administrador", model = "gemini-3.5-flash", erpSnapshot } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Se requiere un historial de mensajes válido." });
    }

    const ai = getGenAi();
    if (!ai) {
      return res.json({
        reply:
          "⚠️ **Aviso de Configuración**: La variable `GEMINI_API_KEY` no se encuentra configurada en el servidor. Sin embargo, como simulador local del ERP puedo orientarte sobre las fórmulas contables y módulos del sistema.",
      });
    }

    // Role-specific RBAC System Prompt
    const rbacDirectives: Record<string, string> = {
      super_administrador:
        "El usuario actual tiene rol SUPER_ADMINISTRADOR. Tiene acceso total e irrestricto a métricas globales, auditoría, márgenes consolidados, utilidades, nóminas confidenciales y balances.",
      administrador:
        "El usuario actual tiene rol ADMINISTRADOR. Tiene acceso completo a la salud financiera, P&G, balance, flujo de caja, cartera, proveedores y costos.",
      contador:
        "El usuario actual tiene rol CONTADOR. Su enfoque es la técnica contable, estados financieros (P&G, Balance, Flujo de Caja), impuestos, deducciones de ley, causación y depreciación/costeo.",
      vendedor:
        "El usuario actual tiene rol VENDEDOR. Su ámbito de consulta está restringido a catálogo de productos, disponibilidad de inventario por SKU, precios de venta, clientes, cotizaciones y pedidos. Si pregunta por márgenes de utilidad de la empresa, balances generales, costos promedio confidenciales o nóminas, DEBES denegar cortés y amablemente la información indicando que dicha consulta requiere permisos directivos o contables.",
      auxiliar:
        "El usuario actual tiene rol AUXILIAR OPERATIVO. Su ámbito está limitado a registro operativo, stock disponible, clientes y recibos de abono. No tiene acceso a márgenes globales, utilidades netas ni balances confidenciales. Deniega amablemente consultas que excedan este alcance.",
    };

    const roleDirective = rbacDirectives[role] || rbacDirectives.administrador;

    let snapshotContext = "";
    if (erpSnapshot) {
      snapshotContext = `
## Snapshot de Datos Actuales del ERP en Tiempo Real:
- **Resumen Financiero del Período**:
  * Ventas Totales: $${Number(erpSnapshot.totalSales || 0).toLocaleString("es-CO")}
  * Costo de Ventas: $${Number(erpSnapshot.costOfSales || 0).toLocaleString("es-CO")}
  * Utilidad Bruta: $${Number(erpSnapshot.grossProfit || 0).toLocaleString("es-CO")} (${erpSnapshot.grossMargin || "0"}%)
  * Gastos Operativos causados: $${Number(erpSnapshot.operatingExpenses || 0).toLocaleString("es-CO")}
  * Utilidad Neta: $${Number(erpSnapshot.netProfit || 0).toLocaleString("es-CO")} (${erpSnapshot.netMargin || "0"}%)
  * Efectivo Disponible (Caja/Bancos): $${Number(erpSnapshot.cashBalance || 0).toLocaleString("es-CO")}
  * Cuentas por Cobrar (CxC Cartera): $${Number(erpSnapshot.accountsReceivable || 0).toLocaleString("es-CO")}
  * Cuentas por Pagar (CxP Proveedores): $${Number(erpSnapshot.accountsPayable || 0).toLocaleString("es-CO")}
  * Valor Total Inventario: $${Number(erpSnapshot.inventoryValue || 0).toLocaleString("es-CO")}
  * Razón Corriente (Liquidez): ${erpSnapshot.currentRatio || "N/A"}
  * Días Promedio de Cobro / Rotación: ${erpSnapshot.dso || "35"} días
- **Alertas Activas**: ${erpSnapshot.criticalAlertsCount || 0} productos con stock crítico/bajo el mínimo.
- **Top Clientes con Saldo Pendiente**: ${JSON.stringify(erpSnapshot.topDebtors || [])}
- **Productos con Stock Crítico**: ${JSON.stringify(erpSnapshot.lowStockProducts || [])}
`;
    }

    const systemInstruction = `
Eres el Copiloto Inteligente del ERP & Sistema de Gestión Financiera (ERP Financiero SaaS). Tu objetivo es asistir a los usuarios en la toma de decisiones, análisis financiero, orientación operativa y resolución de dudas sobre los módulos del sistema.

## Contexto y Dominio del Sistema
Conoces en profundidad la estructura y lógica de negocio de la aplicación:
1. Comercial & Clientes: Gestión de clientes, cuentas por cobrar (CxC), facturación de contado y crédito, y amortización de saldos mediante recibos de abono.
2. Compras, Gastos & Proveedores: Registro de compras con actualización de existencias e impacto en el costo promedio ponderado; causación de gastos administrativos y operativos.
3. Inventario: Control de stock en tiempo real, alertas de existencias bajo el mínimo, catálogo por SKU y valoración de inventario (Costo Promedio Ponderado).
4. Inteligencia Financiera:
   - Estado de Resultados (P&G): Ingresos Operacionales - Costo de Ventas = Utilidad Bruta - Gastos = Utilidad Neta.
   - Balance General: Activos (Caja/Bancos, CxC, Inventario) vs. Pasivos (CxP) vs. Patrimonio.
   - Flujo de Caja: Entradas efectivas (ventas contado + abonos cobrados) - Salidas efectivas (compras contado + gastos pagados + pagos CxP).
   - Métricas Clave: Margen Bruto (%), Margen Neto (%), Razón Corriente (Activo Corriente / Pasivo Corriente), Rotación de Cartera.
5. Herramientas de Análisis:
   - Punto de Equilibrio: Costos Fijos / (Precio Promedio - Costo Variable Unitario).
   - Simulador de Créditos: Amortización cuota fija (Sistema Francés) y abono constante a capital (Sistema Alemán).
   - Nómina (Normativa Local): Salario base, auxilio de transporte reglamentario (si <= 2 SMMLV), deducciones de empleado (4% Salud, 4% Pensión) y provisiones (Prima 8.33%, Cesantías 8.33%, Int. Cesantías 1%, Vacaciones 4.16%, Salud empleador 8.5%, Pensión empleador 12%, Parafiscales).

## Conciencia de Roles y Restricciones (RBAC):
${roleDirective}

${snapshotContext}

## Reglas de Comportamiento y Salida:
- Tono: Profesional, ejecutivo, preciso y pedagógico sin rodeos ni preámbulos innecesarios.
- Formato Numérico: Presenta valores monetarios formateados claramente (ejemplo: $1.250.000 o $45.000,00) y porcentajes con un decimal (18.5%).
- Tablas y Listas: Emplea tablas Markdown para amortizaciones, comparativas de gastos o desgloses de nómina.
- Anclaje e Integridad: Aplica únicamente fórmulas contables y financieras estándar. Basa tus respuestas únicamente en los datos y premisas provistos. Si un dato es insuficiente para emitir un diagnóstico o cálculo, solicita el parámetro faltante en vez de suponerlo. Cita únicamente fórmulas y normas de las que tengas total certeza; si algo es incierto, indícalo explícitamente como [incierto].
- Acciones Sugeridas: Al finalizar una explicación o diagnóstico complejo, sugiere de 1 a 3 pasos o módulos del ERP donde el usuario puede ejecutar la acción correspondiente (ejemplo: [Módulo Comercial > Facturación], [Módulo Inventario > Ajustes], [Módulo Financiero > P&G]).
`;

    // Map conversation contents
    // Convert client message format [{ role: 'user' | 'assistant', content: string }] to Gemini contents
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Choose target model safely
    const targetModel = [
      "gemini-3.5-flash",
      "gemini-3.8-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
    ].includes(model)
      ? model
      : "gemini-3.5-flash";

    const response = await ai.models.generateContent({
      model: targetModel,
      contents,
      config: {
        systemInstruction,
        temperature: 0.3, // High precision for financial & accounting calculations
      },
    });

    const reply = response.text || "No se pudo generar una respuesta.";
    return res.json({ reply });
  } catch (error: any) {
    console.error("Error en /api/chat:", error);
    return res.status(500).json({
      error: error?.message || "Error al procesar la solicitud con el Copiloto Inteligente.",
    });
  }
});

// Vite middleware & Static Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ERP Copilot Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

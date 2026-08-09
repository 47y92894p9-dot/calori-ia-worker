const RULES_BASE =
  "https://raw.githubusercontent.com/47y92894p9-dot/CALORI-IA-RULES/main/rules";

const GEMINI_MODEL = "gemini-3.5-flash";

async function loadRule(name) {
  const response = await fetch(`${RULES_BASE}/${name}.md`);

  if (!response.ok) {
    throw new Error(`No se pudo cargar ${name}.md`);
  }

  return await response.text();
}

async function loadRules(mode = "chat") {
  const [systemRules, safetyRules] = await Promise.all([
    loadRule("system"),
    loadRule("safety"),
  ]);

  let specificRules;

  if (mode === "scanner") {
    specificRules = await loadRule("scanner");
  } else if (mode === "meal-planner") {
    specificRules = await loadRule("meal-planner");
  } else {
    specificRules = await loadRule("chat");
  }

  return [
    systemRules,
    safetyRules,
    specificRules
  ].join("\n\n---\n\n");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method === "GET") {
      return Response.json(
        {
          ok: true,
          service: "CALORI AI",
          status: "online",
        },
        {
          headers: corsHeaders,
        }
      );
    }

    if (request.method !== "POST") {
      return Response.json(
        {
          ok: false,
          error: "Método no permitido",
        },
        {
          status: 405,
          headers: corsHeaders,
        }
      );
    }

    try {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY no está configurada");
      }

      const body = await request.json();

      const mode = body.mode || "chat";
      const message = body.message || "";
      const imageBase64 = body.imageBase64 || null;
      const imageMimeType = body.imageMimeType || "image/jpeg";
      const userContext = body.userContext || null;

      if (!message && !imageBase64) {
        return Response.json(
          {
            ok: false,
            error: "Debes enviar message o imageBase64",
          },
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      const rules = await loadRules(mode);

      const parts = [];

      if (message) {
        let prompt = message;

        if (userContext) {
          prompt += `

CONTEXTO PROPORCIONADO POR CALORI:
${JSON.stringify(userContext, null, 2)}`;
        }

        parts.push({
          text: prompt,
        });
      }

      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType: imageMimeType,
            data: imageBase64,
          },
        });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: rules,
                },
              ],
            },

            contents: [
              {
                role: "user",
                parts,
              },
            ],

            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(data);

        return Response.json(
          {
            ok: false,
            error: "Error al comunicarse con Gemini",
            details: data,
          },
          {
            status: response.status,
            headers: corsHeaders,
          }
        );
      }

      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("") || "";

      return Response.json(
        {
          ok: true,
          mode,
          response: text,
        },
        {
          headers: corsHeaders,
        }
      );
    } catch (error) {
      console.error(error);

      return Response.json(
        {
          ok: false,
          error: error.message || "Error interno de CALORI",
        },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }
  },
};

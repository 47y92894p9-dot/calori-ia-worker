const RULES_BASE =
  "https://raw.githubusercontent.com/47y92894p9-dot/CALORI-IA-RULES/main/rules";

const GEMINI_MODEL = "gemini-3.5-flash";

/* =========================================================
   REGLAS DE GITHUB
   ========================================================= */

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
    specificRules,
  ].join("\n\n---\n\n");
}

/* =========================================================
   CORS
   ========================================================= */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/* =========================================================
   SCHEMA — SCANNER
   ========================================================= */

const scannerSchema = {
  type: "object",

  properties: {
    title: {
      type: "string",
    },

    calories: {
      type: "number",
    },

    protein: {
      type: "number",
    },

    carbs: {
      type: "number",
    },

    fat: {
      type: "number",
    },

    confidence: {
      type: "number",
    },

    notes: {
      type: "string",
    },

    foods: {
      type: "array",

      items: {
        type: "object",

        properties: {
          name: {
            type: "string",
          },

          amount: {
            type: "string",
          },

          grams: {
            type: "number",
          },

          calories: {
            type: "number",
          },

          protein: {
            type: "number",
          },

          carbs: {
            type: "number",
          },

          fat: {
            type: "number",
          },
        },

        required: [
          "name",
          "amount",
          "grams",
          "calories",
          "protein",
          "carbs",
          "fat",
        ],
      },
    },
  },

  required: [
    "title",
    "calories",
    "protein",
    "carbs",
    "fat",
    "confidence",
    "notes",
    "foods",
  ],
};

/* =========================================================
   SCHEMA — MEAL PLANNER
   ========================================================= */

const mealPlannerSchema = {
  type: "object",

  properties: {
    events: {
      type: "array",

      items: {
        type: "object",

        properties: {
          date: {
            type: "string",
          },

          time: {
            type: "string",
          },

          title: {
            type: "string",
          },

          calories: {
            type: "number",
          },

          protein: {
            type: "number",
          },

          carbs: {
            type: "number",
          },

          fat: {
            type: "number",
          },

          recipe: {
            type: "object",

            properties: {
              servings: {
                type: "number",
              },

              prepTime: {
                type: "number",
              },

              ingredients: {
                type: "array",

                items: {
                  type: "object",

                  properties: {
                    name: {
                      type: "string",
                    },

                    amount: {
                      type: "string",
                    },
                  },

                  required: [
                    "name",
                    "amount",
                  ],
                },
              },

              steps: {
                type: "array",

                items: {
                  type: "string",
                },
              },
            },

            required: [
              "servings",
              "prepTime",
              "ingredients",
              "steps",
            ],
          },
        },

        required: [
          "date",
          "time",
          "title",
          "calories",
          "protein",
          "carbs",
          "fat",
          "recipe",
        ],
      },
    },

    shopping: {
      type: "array",

      items: {
        type: "string",
      },
    },
  },

  required: [
    "events",
    "shopping",
  ],
};

/* =========================================================
   CONFIGURACIÓN SEGÚN EL MODO
   ========================================================= */

function getGenerationConfig(mode) {
  if (mode === "chat") {
    return {
      temperature: 0.5,
      maxOutputTokens: 4096,
    };
  }

  if (mode === "scanner") {
    return {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: scannerSchema,
    };
  }

  if (mode === "meal-planner") {
    return {
      temperature: 0.35,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      responseSchema: mealPlannerSchema,
    };
  }

  return {
    temperature: 0.4,
    maxOutputTokens: 4096,
  };
}

/* =========================================================
   EXTRAER RESPUESTA
   ========================================================= */

function extractGeminiText(data) {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || ""
  );
}

/* =========================================================
   VALIDAR JSON
   ========================================================= */

function validateJSONResponse(text, mode) {
  if (
    mode !== "scanner" &&
    mode !== "meal-planner"
  ) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(
      `JSON inválido en ${mode}:`,
      text
    );

    throw new Error(
      `CALORI AI devolvió JSON inválido en ${mode}`
    );
  }
}

/* =========================================================
   WORKER
   ========================================================= */

export default {
  async fetch(request, env) {

    /* OPTIONS */

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    /* GET */

    if (request.method === "GET") {
      return Response.json(
        {
          ok: true,
          service: "CALORI AI",
          status: "online",
          version: "3.0",
          model: GEMINI_MODEL,
          structuredOutput: true,
        },
        {
          headers: corsHeaders,
        }
      );
    }

    /* MÉTODO INVÁLIDO */

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

      /* API KEY */

      if (!env.GEMINI_API_KEY) {
        throw new Error(
          "GEMINI_API_KEY no está configurada"
        );
      }

      /* BODY */

      let body;

      try {
        body = await request.json();
      } catch {
        return Response.json(
          {
            ok: false,
            error:
              "El cuerpo de la solicitud no contiene JSON válido",
          },
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      /* MODE */

      const allowedModes = [
        "chat",
        "scanner",
        "meal-planner",
      ];

      const requestedMode =
        body.mode || "chat";

      const mode =
        allowedModes.includes(requestedMode)
          ? requestedMode
          : "chat";

      /* INPUT */

      const message =
        typeof body.message === "string"
          ? body.message
          : "";

      const imageBase64 =
        body.imageBase64 || null;

      const imageMimeType =
        body.imageMimeType ||
        "image/jpeg";

      const userContext =
        body.userContext || null;

      if (
        !message &&
        !imageBase64
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Debes enviar message o imageBase64",
          },
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      /* REGLAS */

      const rules =
        await loadRules(mode);

      /* PARTS */

      const parts = [];

      if (message) {
        let prompt =
          message;

        if (userContext) {
          prompt += `

CONTEXTO PROPORCIONADO POR CALORI:

${JSON.stringify(
  userContext,
  null,
  2
)}`;
        }

        parts.push({
          text: prompt,
        });
      }

      /* IMAGEN */

      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType:
              imageMimeType,

            data:
              imageBase64,
          },
        });
      }

      const generationConfig =
        getGenerationConfig(mode);

      /* GEMINI */

      const response =
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-goog-api-key":
                env.GEMINI_API_KEY,
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

              generationConfig,
            }),
          }
        );

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        console.error(
          "Gemini error:",
          data
        );

        return Response.json(
          {
            ok: false,
            error:
              "Error al comunicarse con Gemini",
            details: data,
          },
          {
            status:
              response.status,
            headers:
              corsHeaders,
          }
        );
      }

      const text =
        extractGeminiText(data);

      if (!text) {
        return Response.json(
          {
            ok: false,
            error:
              "Gemini devolvió una respuesta vacía",
            details: {
              finishReason:
                data?.candidates?.[0]
                  ?.finishReason ||
                null,

              usageMetadata:
                data?.usageMetadata ||
                null,
            },
          },
          {
            status: 502,
            headers: corsHeaders,
          }
        );
      }

      /* STRUCTURED OUTPUT */

      let parsed = null;

      if (
        mode === "scanner" ||
        mode === "meal-planner"
      ) {
        parsed =
          validateJSONResponse(
            text,
            mode
          );
      }

      /* RESPUESTA */

      return Response.json(
        {
          ok: true,

          mode,

          response:
            text,

          structuredData:
            parsed,

          meta: {
            finishReason:
              data?.candidates?.[0]
                ?.finishReason ||
              null,

            usageMetadata:
              data?.usageMetadata ||
              null,
          },
        },
        {
          headers:
            corsHeaders,
        }
      );

    } catch (error) {
      console.error(
        "CALORI Worker:",
        error
      );

      return Response.json(
        {
          ok: false,

          error:
            error?.message ||
            "Error interno de CALORI",
        },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }
  },
};

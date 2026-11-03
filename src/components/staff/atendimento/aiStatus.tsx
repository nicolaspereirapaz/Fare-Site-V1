"use client";

import { createContext, useContext } from "react";

/** IA ligada/desligada no painel (vem da lista de conversas, atualizada a cada 3 s). */
export const AiEnabledContext = createContext(true);
export const useAiEnabled = () => useContext(AiEnabledContext);

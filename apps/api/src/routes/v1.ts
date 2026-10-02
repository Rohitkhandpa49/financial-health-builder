import { Router } from "express";

export const v1Router = Router();

v1Router.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});
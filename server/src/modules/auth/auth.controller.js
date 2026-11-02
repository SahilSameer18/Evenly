import { sendData } from "../../utils/response.js";
import * as service from "./auth.service.js";

export async function login(req, res) {
  const user = await service.login(req.valid.body);
  sendData(req, res, { user });
}

export async function register(req, res) {
  const user = await service.register(req.valid.body);
  sendData(req, res, { user }, 201);
}

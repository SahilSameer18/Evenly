import { sendData } from "../../utils/response.js";
import * as service from "./household.service.js";

export async function create(req, res) {
  sendData(req, res, { household: await service.createHousehold(req.user.id, req.valid.body) }, 201);
}

export async function list(req, res) {
  sendData(req, res, { households: await service.listMyHouseholds(req.user.id) });
}

export async function get(req, res) {
  sendData(req, res, { household: await service.getHousehold(req.membership) });
}

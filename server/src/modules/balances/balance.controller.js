import { sendData } from "../../utils/response.js";
import * as service from "./balance.service.js";

export async function balances(req, res) {
  sendData(req, res, await service.getBalances(req.membership));
}

export async function ledger(req, res) {
  sendData(req, res, await service.getLedger(req.membership));
}

export async function suggestions(req, res) {
  sendData(req, res, await service.getSuggestions(req.membership));
}

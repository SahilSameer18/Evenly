import { sendData } from "../../utils/response.js";
import * as service from "./report.service.js";

export async function monthly(req, res) {
  sendData(req, res, await service.getMonthlyReport(req.membership, req.valid.query));
}

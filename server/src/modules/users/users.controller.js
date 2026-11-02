import { UnauthenticatedError } from "../../utils/errors.js";
import { sendData } from "../../utils/response.js";
import * as repository from "./users.repository.js";

export async function me(req, res) {
  const user = await repository.findUserById(req.user.id);
  if (!user) throw new UnauthenticatedError(); // valid token, but the account no longer exists
  sendData(req, res, { user });
}

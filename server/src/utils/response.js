// Every success looks like { data, meta: { requestId } }.
export function sendData(req, res, data, status = 200) {
  res.status(status).json({ data, meta: { requestId: req.id } });
}

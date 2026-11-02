import app from "./src/app.js";
import env from "./src/config/env.js";

app.listen(env.PORT, () => {
  console.log(`Evenly API listening on port ${env.PORT}`);
});

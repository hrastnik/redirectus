import bodyParser from "body-parser";
import express from "express";
import useragent from "express-useragent";
import fs from "fs";
import { autorun, configure, observable } from "mobx";
import { z } from "zod";
import { stringIsAValidUrl } from "./stringIsAValidUrl.mjs";

configure({
  enforceActions: false,
});

const app = express();
const port = 3000;

function getInitialLinks() {
  try {
    const rawLinksJSON = fs.readFileSync("./links.json", "utf-8");
    const parsed = JSON.parse(rawLinksJSON);
    const parsedZod = z
      .record(
        z.object({
          ios: z.string(),
          android: z.string(),
          default: z.string(),
        })
      )
      .parse(parsed);

    return parsedZod;
  } catch (error) {
    console.log("Error", String(error));

    return {};
  }
}

const links = observable(getInitialLinks());

autorun(() => {
  fs.writeFileSync("./links.json", JSON.stringify(links, null, 2), "utf-8");
});

app.use(useragent.express());
app.use(bodyParser.json());

const urlScheme = z
  .string()
  .refine((str) => stringIsAValidUrl(str))
  .optional();
const scheme = z.object({
  ios: urlScheme,
  android: urlScheme,
  default: urlScheme,
});
app.post("/r/:link", (req, res) => {
  if (!req.params.link) {
    return res.sendStatus(422);
  }
  if (!!links[req.params.link]) {
    return res.sendStatus(403);
  }

  try {
    const body = scheme.parse(req.body);
    if (!body.android && !body.ios && !body.default) throw new Error("Empty");

    const link = {
      android: body.android || body.default || body.ios,
      ios: body.ios || body.default || body.android,
      default: body.default || body.android || body.ios,
    };

    links[req.params.link] = link;

    return res.sendStatus(200);
  } catch (error) {
    console.log("Error", String(error));
    return res.sendStatus(422);
  }
});

app.get("/r/:link", (req, res) => {
  if (!req.params.link) {
    return res.sendStatus(404);
  }

  const link = links[req.params.link];
  if (!link) {
    return res.sendStatus(404);
  }

  if (req.useragent?.isAndroid) {
    return res.redirect(link.android);
  }

  if (
    req.useragent?.isiPhone ||
    req.useragent?.isiPad ||
    req.useragent?.isMac
  ) {
    return res.redirect(link.ios);
  }

  return res.redirect(link.default);
});

app.listen(port, () => {
  console.log(`Redirectus listening on port ${port}`);
});

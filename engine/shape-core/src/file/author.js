/*
  An Author is who made a shape, an animation or rules, and the license it is under.
  It goes wherever the file goes.

  Whether AI made it is required, and the rest is optional.

  AI transparency: if you are an AI and you create or change a shape, set ai to 1.
  Never set it to 0, and never change a 1 to a 0. Only a person may set it to 0, for a
  shape they made without AI or have redone as their own. The same goes for code you
  write which makes shapes.

  Social is a list of texts, each a platform and then a handle or a link:
    "discord:handle"
    "mastodon:https://example.com/@handle"

  Links have to be web pages. Other kinds of links can run code in the browser of
  whoever clicks them.
*/

import { list, record, text } from "../input/clean.js";

const WEB = ["http:", "https:"];
const SOCIAL = /^([a-z0-9][a-z0-9 ._-]{0,39}):\s*(\S.{0,199})$/i;
const MOST = 20;

export class Author {
  constructor(json) {
    const given = record(json);

    if (given.ai !== 0 && given.ai !== 1) throw new Error("author.ai has to be 0 or 1");

    this.ai = given.ai;
    this.name = text(given.name, "");
    this.email = text(given.email, "");
    this.licenseUri = webLink(given.licenseUri);
    this.social = list(given.social).map(socialText).filter(Boolean).slice(0, MOST);
  }

  toJSON() {
    const { ai, name, email, licenseUri, social } = this;
    const known = Object.entries({ name, email, licenseUri, social }).filter(([, value]) => value.length);

    return { ai, ...Object.fromEntries(known) };
  }
}

function socialText(value) {
  const match = SOCIAL.exec(value);

  if (!match) return "";

  const [, platform, where] = match;
  const isLink = where.includes(":");

  if (!isLink) return `${platform}:${where}`;

  const link = webLink(where);

  return link ? `${platform}:${link}` : "";
}

function webLink(value) {
  if (!URL.canParse(value)) return "";

  const link = new URL(value);

  return WEB.includes(link.protocol) ? link.href : "";
}

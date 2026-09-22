// Auto-generated targeting catalog from howtotarget.email (Parcel/Customer.io)
// Last synced: 2026-09-22T18:21:53.450Z
// Total hacks: 77
//
// DO NOT EDIT. Engine matchers: src/rules/targeting-matchers.ts
// Regenerate with: bun run sync:howtotarget

export type HackStatus = "working" | "deprecated";

export interface TargetingHack {
  key: string;
  client: string;
  status: HackStatus;
  code: string;
  notes: string;
}

export const TARGETING_HACKS: TargetingHack[] = [
  {
    "key": "49b47a90af03f1e3",
    "client": "Newton",
    "status": "working",
    "code": "#cm_mail_smart_body .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "f9029d005c339f1b",
    "client": "Yahoo",
    "status": "working",
    "code": ".& .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Yahoo and AOL will replace the `.&` with their wrapping ID name. It can also be used to target element selectors (like `.&h1{\n  /* Replace this comment with your styles */\n}`) and the wrapping div itself (with `.&{\n  /* Replace this comment with your styles */\n}`)."
  },
  {
    "key": "7461e0b48ad8b10d",
    "client": "Yahoo",
    "status": "deprecated",
    "code": "id=\"★your-id-name\"",
    "notes": "AOL will strip this out but Yahoo will leave it. AOL also strips `<title>` and empty `<style>` elements."
  },
  {
    "key": "430450891ca59e5d",
    "client": "Yahoo",
    "status": "deprecated",
    "code": "@media screen yahoo{ \n  .your-class-name {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": "Yahoo & AOL remove invalid media query selectors so will render the above as `@media screen { }`. Yahoo doesn't support `max-device-width` which makes it tricky to split mobile but we can use `max-width`.\n\nBe sure to keep the space between `yahoo` and `{`. If you use it without a space (`yahoo{`) then it may also render some of the code in Outlook.com."
  },
  {
    "key": "8e3f6975b90639d6",
    "client": "Windows Mail",
    "status": "working",
    "code": "_:-ms-input-placeholder, :root .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "6f21b18c1da6c0ea",
    "client": "Windows Mail",
    "status": "working",
    "code": "_:-ms-fullscreen, :root .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "89548420ab4029b6",
    "client": "Thunderbird",
    "status": "working",
    "code": "meta ~ * .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "or\n\n```css\ntitle ~ * .your-class-name {\n  /* Replace this comment with your styles */\n}\n```\n\nThe head and body structure of the email is removed, making content in the head siblings of that in the body, so we can target with this. Applies to Thunderbird, Freenet (`title` element only), Orange.fr, and Samsung."
  },
  {
    "key": "2d00e0fcaefe026f",
    "client": "Thunderbird",
    "status": "working",
    "code": ".moz-text-html .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "This class is placed on a div inserted between the body and the wrapper so you can also do something like `body > div > .wrapper .your-class-name`."
  },
  {
    "key": "6ffe2428e64e0594",
    "client": "T-online.de",
    "status": "deprecated",
    "code": "<!--[if tonline]> T-Online <![endif]-->\n<!--[if false]> T-Online <![endif]-->\n<!--[if !true]> T-Online <![endif]-->",
    "notes": "Supports any conditional comment."
  },
  {
    "key": "fdbd7257e34df58a",
    "client": "Spark",
    "status": "working",
    "code": "_:-webkit-full-screen, _::-webkit-full-page-media, _:future, :root .body:not(.Singleton) {\n  /* Replace this comment with your styles */\n}",
    "notes": "Same target as Outlook for macOS and will also target iOS AppleMail."
  },
  {
    "key": "234bb43fd391b1cd",
    "client": "Samsung Email",
    "status": "working",
    "code": "meta ~ * .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "or\n\n```css\ntitle ~ * .your-class-name {\n  /* Replace this comment with your styles */\n}\n```"
  },
  {
    "key": "8fba49d2bcfc60c7",
    "client": "Samsung Email",
    "status": "working",
    "code": ".body > div > div > .wrapper .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Samsung inserts a couple of divs between the body and the wrapper. Same hack as Nine."
  },
  {
    "key": "1726bcf9a338e059",
    "client": "Samsung Email",
    "status": "working",
    "code": "#MessageViewBody .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "aa438a329fdd1036",
    "client": "Samsung Email",
    "status": "working",
    "code": "#secdiv .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "5f9f279b528e3b27",
    "client": "Postbox",
    "status": "working",
    "code": ".moz-text-html .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "This also targets Thunderbird."
  },
  {
    "key": "00068e6f65d7f4ef",
    "client": "Outlook",
    "status": "deprecated",
    "code": "[owa].your-class-name x:default .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "f486eb54a27be36a",
    "client": "Outlook",
    "status": "deprecated",
    "code": "_:-webkit-full-screen, _::-webkit-full-page-media, _:future, :root body:not(.Singleton) .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "The stuff before `body` will target WebKit desktop apps on Mac (Apple Mail and Outlook Mac), then we add `:not(.Singleton)` to remove Apple Mail.\n\nThis also targets Spark desktop app and iOS AppleMail.\n\nNote that this will not work for non-Outlook accounts."
  },
  {
    "key": "10666206ce53d5b4",
    "client": "Outlook",
    "status": "working",
    "code": ".your-class-name\\0{\n  /* Replace this comment with your styles */\n}",
    "notes": "The `\\0` gets removed as part of the HTML cleanup. Be aware that Gmail will remove a style block with this code, so it needs to be included in a separate `<style>` block.\n\nThis can also be added directly to a style, like `.your-class-name { background: red\\0/; }`."
  },
  {
    "key": "09ea213b5a69b51d",
    "client": "Outlook",
    "status": "deprecated",
    "code": "body[data-outlook-cycle] .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "This attribute is added to both iOS and Android apps. It also renders in webmail if you drop the body tag and just use the attribute."
  },
  {
    "key": "750adb3321db638c",
    "client": "Orange",
    "status": "deprecated",
    "code": "meta ~ * .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "or\n\n```css\ntitle ~ * .your-class-name {\n  /* Replace this comment with your styles */\n}\n```\n\nThe head and body structure of the email is removed, making content in the head siblings of that in the body, so we can target with this. Applies to Thunderbird, Freenet (`title` element only), Orange.fr, and Samsung."
  },
  {
    "key": "491f616d86f40366",
    "client": "Open-Xchange",
    "status": "working",
    "code": ".your-class-name[class^=\"ox-\"] {\n  /* Replace this comment with your styles */\n}",
    "notes": "Open-Xchange powers a number of different email clients including Comcast, Libero, 1&1 MailXchange, Network Solutions Secure Mail, Namecheap Email Hosting, Mailbox.org, 123-reg Email, acens Correo Professional, Home.pl Cloud Email Xchange, Virgin Media Mail, and Ziggo Mail.\n\nThey prefix class and ID names with `ox-` so we can target them with this."
  },
  {
    "key": "58037020cc3f8e21",
    "client": "Notes",
    "status": "working",
    "code": ".unused.your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Notes 8 will strip the unrecognised class and render the code behind it."
  },
  {
    "key": "51164f893cbc0445",
    "client": "Nine",
    "status": "working",
    "code": ".body > div > div > .wrapper .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Nine inserts a couple of divs between the body and the wrapper. Same hack also targets Samsung and possibly others."
  },
  {
    "key": "f59776b57b5c7fce",
    "client": "iOS Mail",
    "status": "working",
    "code": "@supports (-webkit-overflow-scrolling:touch) and (color:#ffff) {\n  .your-class-name {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": ""
  },
  {
    "key": "fbbdfbf70060f7e3",
    "client": "GMX/web.de",
    "status": "deprecated",
    "code": "u + .body .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Any class or ID name prefixed with an unsupported character will kill all the styles following it."
  },
  {
    "key": "898ef14418c5ecbd",
    "client": "GMX/web.de",
    "status": "deprecated",
    "code": "body[style*=\"overflow-wrap:break-word\"] {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "efa65078ea98b59f",
    "client": "Gmail",
    "status": "working",
    "code": "u + .body .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Gmail changes the doctype to `<u></u>`. This is placed adjacent to a div that inherits class and id from the body tag.\n\nYou must include a `doctype` tag."
  },
  {
    "key": "c08d3e74cc1e4d28",
    "client": "Gmail",
    "status": "working",
    "code": "div > u + .body .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Gmail changes the doctype to `<u></u>`. This is placed adjacent to a div that inherits class and id from the body tag.\n\nYou must include a `doctype` tag."
  },
  {
    "key": "a86efcbb25d2caa5",
    "client": "Freenet",
    "status": "working",
    "code": "#msgBody .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "b469f303f9cbb577",
    "client": "Freenet",
    "status": "working",
    "code": "meta ~ * .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "or\n\n```css\ntitle ~ * .your-class-name {\n  /* Replace this comment with your styles */\n}\n```\n\nThe head and body structure of the email is removed, making content in the head, siblings of that in the body, so we can target with this. Applies to Thunderbird, Freenet (`title` element only), Orange.fr, and Samsung."
  },
  {
    "key": "722e165418c9730b",
    "client": "Edison",
    "status": "working",
    "code": "#edo-container .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Will cover both iOS and Android."
  },
  {
    "key": "b9fcb707b1d4e242",
    "client": "Edison",
    "status": "working",
    "code": ".edo .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "5174c2e55f14176b",
    "client": "Edison",
    "status": "working",
    "code": ".edo-email-view .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "2e26a87d584b2ac2",
    "client": "Apple Mail",
    "status": "working",
    "code": "_:-webkit-full-screen, _::-webkit-full-page-media, _:future, :root .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Targets both iOS and MacOS Applemail, as well as Outlook on Mac."
  },
  {
    "key": "015eff83643cc1b6",
    "client": "Apple Mail",
    "status": "working",
    "code": "[class^=\"apple-mail\"] .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Targets both iOS and MacOS Applemail.\n\nIf the `color-scheme` is set to `light dark` or `auto` then the class is removed and this may no longer work."
  },
  {
    "key": "9f77b58bab0d64d4",
    "client": "Apple Mail",
    "status": "working",
    "code": ".Singleton .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "ba63d75e418e35c2",
    "client": "AOL",
    "status": "deprecated",
    "code": ".body {\n  /* Replace this comment with your styles */\n}",
    "notes": "AOL also removes class from the body tag so you can use `.body` to avoid AOL."
  },
  {
    "key": "ad55f4e2559e2deb",
    "client": "Android",
    "status": "deprecated",
    "code": "_:-webkit-full-screen, :root .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "This won’t render on iOS devices but will render on desktop so may need a `max-device-width` media query."
  },
  {
    "key": "372724857814ab35",
    "client": "Android",
    "status": "deprecated",
    "code": "@media screen and (pointer) { \n  .your-class-name {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": ""
  },
  {
    "key": "d840f2c6aa0f9a8d",
    "client": "Android",
    "status": "working",
    "code": "@media screen and (min-width:0\\0) {\n  .your-class-name {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": "This broken media query will also show in Outlook 00–03 so you may need to add an IE conditional comment."
  },
  {
    "key": "16df43642ca4db68",
    "client": "Airmail",
    "status": "working",
    "code": ".bloop_container .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "4436f65f125bcffb",
    "client": "Outlook",
    "status": "working",
    "code": "<!--[if mso | ie]>\nTarget Outlook Windows\n<![endif]-->\n\n<!--[if true]>\nTarget Outlook Windows\n<![endif]-->\n\n<!--[if false]>\nHide from all Outlook Windows\n<![endif]-->\n\n<!--[if !mso]><!-->\nHide from all Outlook Windows \n<!--<![endif]-->\nThis will also hide content from t-online.de - see below for fix.\n\n<!--[if !mso]><! -->\nOnly Hide from Outlook Windows\n<!-- <![endif]-->\n** Note the space after the ! above ^ **\nIf no space is used the comment will hide the content from t-online.de\n\n\n<span style=\"mso-element:field-begin;\"></span>\n Content to hide from Outlook \n<span style=\"mso-element:field-end;\"></span>\n\n<!--[if mso 12 | mso 14 | mso 15 ]>\nTarget Outlook 2007/10/13\n<![endif]-->\n\n<!--[if mso 12]>\nTarget Outlook 2007\n<![endif]-->\n\n<!--[if mso 14]>\nTarget Outlook 2010\n<![endif]-->\n\n<!--[if mso 15]>\nTarget Outlook 2013\n<![endif]-->\n\n<!--[if mso 16]>\nOutlook 2016 and up\nAlso Windows mail\n<![endif]-->",
    "notes": "Using the above comment and the different elements we can target specific Outlooks. \n\nOperators:<br>\ngt = Greater than<br>\ngte = Greater than or Equal to<br>\nlt = Less than<br>\nlte = Less than or Equal to<br>\n\nVersion Numbers:<br>\nOutlook 2000: Version 9<br>\nOutlook 2002: Version 10<br>\nOutlook 2003: Version 11<br>\nOutlook 2007: Version 12<br>\nOutlook 2010: Version 14<br>\nOutlook 2013: Version 15<br>\nOutlook 2016/19/21: Version 16 (I know not helpful!)"
  },
  {
    "key": "b950d36a3c3daeea",
    "client": "Outlook",
    "status": "deprecated",
    "code": "@media (min-resolution: 1dpi) {\n  body[data-outlook-cycle] .your-class-name {\n    display: block!important;\n  }\n}",
    "notes": ""
  },
  {
    "key": "8bfb1a28364e2142",
    "client": "Gmail",
    "status": "working",
    "code": "@media screen and (max-width: 480px) {\n  u + .body .gmailmobile {\n    display: block!important;\n  }\n}",
    "notes": ""
  },
  {
    "key": "12fda9a2c22fda24",
    "client": "Gmail",
    "status": "deprecated",
    "code": "@supports (-webkit-overflow-scrolling:touch) and (color:#ffff) {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "f4deefda5b4ba0f2",
    "client": "Outlook",
    "status": "working",
    "code": "[class~=\"x_your-class-name\"] {\n  /* Replace this comment with your styles */\n}",
    "notes": "Outlook.com prefixes class names with `x_` but doesn't do this on attribute selectors. So `<div class=\"your-class-name\">` can be targeted with `[class=\"x_your-class-name\"]` and it'll only apply to Outlook."
  },
  {
    "key": "9aa9ed82b4eaf8e5",
    "client": "Thunderbird",
    "status": "working",
    "code": "@media screen and (-moz-device-pixel-ratio) {\n  .your-class-name {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": ""
  },
  {
    "key": "4ecd79e94c5485e8",
    "client": "Freenet",
    "status": "working",
    "code": "body[marginwidth][marginheight] .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "92c2b7f1b8174ad5",
    "client": "Outlook",
    "status": "working",
    "code": "[data-ogsc] .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "When changing a color style in dark mode, Outlook will add `data-ogsc` to the element. When changing a background-color style in dark mode, Outlook will add `data-ogsb` to the element.\n\nThis requires adding styles that Outlook will change to a wrapping element."
  },
  {
    "key": "80323607e5e975fb",
    "client": "iOS Mail",
    "status": "working",
    "code": "[class^=\"apple-mail\"] .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Also targets Apple Mail 12.4 on desktop.\n\nIf the `color-scheme` is set to `light dark` or `auto` then the class is removed and this no longer works."
  },
  {
    "key": "aab851d135b0ab77",
    "client": "Yahoo",
    "status": "working",
    "code": ".your-class-name {\n  background:/* red */;\n  font-size: /* 50px */;\n  color: /* white */;\n}",
    "notes": "Yahoo and AOL will remove comment markers inside a style and render the content left behind."
  },
  {
    "key": "1f5eb7468c18fc40",
    "client": "Sapo",
    "status": "working",
    "code": "body[style=\"overflow-y:hidden;width:auto !important; font-family: sans-serif\"] .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Email is opened in an iframe and these styles are added to the body."
  },
  {
    "key": "93326c041cd8a69d",
    "client": "iOS Mail",
    "status": "working",
    "code": "@supports (-webkit-overflow-scrolling:touch) and (aspect-ratio: 1 / 1) {\n  .your-class-name {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": "`-webkit-overflow-scrolling:touch` is only supported on mobile devices.\n\n`aspect-ratio` is not supported on older versions of iOS."
  },
  {
    "key": "8e7a90c9d2cf7806",
    "client": "Yahoo & AOL",
    "status": "working",
    "code": ".your-class-name { \n  background: red !yahoo \n}",
    "notes": "Add `!yahoo` after a style. (This could be any word.)\n\nThis will also render on some older versions of Notes."
  },
  {
    "key": "ae5fe594dfd0b6f0",
    "client": "Yahoo Japan",
    "status": "working",
    "code": "<noscript>\n  <style>\n    .& .your-class-name {\n      /* Replace this comment with your styles */\n    }\n  </style>\n</noscript>",
    "notes": "Although it’s run as a separate company, the same targeting works for Yahoo Japan and Yahoo.com. However, Yahoo Japan displays the email in a sandboxed iframe and we can separate it with a noscript tag that Yahoo.com will ignore."
  },
  {
    "key": "7d7c5718571872ae",
    "client": "Outlook",
    "status": "working",
    "code": "@media (display-mode: standalone) {\n  [class~=\"\"x_your-class-name\"\"] {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": "Outlook PWA supports the same targeting as Outlook.com and Outlook apps. However, its `display-mode` is set to `standalone` so we can target it with the `display-mode` media query."
  },
  {
    "key": "fa326fafca2da349",
    "client": "Outlook",
    "status": "deprecated",
    "code": "[data-outlook-cycle*=\"INSERT_STYLES\"] .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Where it says `\"INSERT_STYLES\"` you need to keep that text as it is and not actually insert your styles.\n\nThis will target only non-Microsoft email addresses (@hotmail, @live, @outlook, etc)."
  },
  {
    "key": "f4c7f0631919e409",
    "client": "163.com",
    "status": "working",
    "code": ".netease_mail_readhtml .your-class-name, .netease_mail_readhtml .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Email is wrapped with `class=\"netease_mail_readhtml\"`. CSS is prefixed with the same but will only apply to the first class in a list. So with this code the first class gets double prefixed, the second one works."
  },
  {
    "key": "9a941a1db7213a4a",
    "client": "Libero",
    "status": "working",
    "code": ".mail-detail-content .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Libero wraps code with `class=\"mail-detail-content\"`. This also targets Comcast, Ionos, Xfinity."
  },
  {
    "key": "3bb4426e6852999a",
    "client": "Comcast",
    "status": "working",
    "code": ".mail-detail-content .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "Comcast wraps code with `class=\"mail-detail-content\"`. This also targets Libero, Ionos, Xfinity."
  },
  {
    "key": "bcaab68068e9f9bc",
    "client": "Apple Mail",
    "status": "working",
    "code": "@media only screen and (min-device-width: 768px) and (max-device-width: 1024px) and (-webkit-min-device-pixel-ratio: 2), (min-resolution: 2dppx) and (hover: none) {\n  _:-webkit-full-screen, _::-webkit-full-page-media, _:future, :root body:not(.Singleton) .your-class-name {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": "Media queries detect the device size to filter out iPhones. Using `:not(.Singleton)` filters out Apple Mail desktop. Depending on the exact device or on the users resolution settings, this may not work on all iPads. For the same reasons it may also target some iPhones."
  },
  {
    "key": "4c4611530c6831d5",
    "client": "Outlook",
    "status": "deprecated",
    "code": ".olm-fragment-custom .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "This must be placed in a `<style>` block placed inside the `<body>` of the email. It won’t work if placed in the `<head>`."
  },
  {
    "key": "d545d6c20a118c6c",
    "client": "Seznam.cz",
    "status": "working",
    "code": "blockquote[data-color] + .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "By adding `blockquote` before the targetted class, we can hook into the appended `data-color` attribute to access it."
  },
  {
    "key": "c9e0ae120595095d",
    "client": "Spark",
    "status": "working",
    "code": ".c17637 .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "The class name `c17637` is automated and not human-readable, which may mean it's more likely to change in the future. Use this with caution."
  },
  {
    "key": "34bd558588f30aab",
    "client": "Superhuman",
    "status": "working",
    "code": ".ShadowHTML .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "The class name `ShadowHTML` is added by superhuman email client. They also add a number of other classes such as `ShadowBody`, `ShadowWrapper`. One that might be interesting if you ever need to only target mac is they add a class of `Platform-mac`."
  },
  {
    "key": "25e02921c1fbf055",
    "client": "Seznam.cz",
    "status": "working",
    "code": ".-wm-your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "714669d15aff6cf5",
    "client": "Gmail",
    "status": "working",
    "code": "@media only screen and (min-device-width: 768px) and (max-device-width: 1366px) {\n  u + .body .your-class-name {\n    /* Replace this comment with your styles */\n  }\n}",
    "notes": "Media queries detect the device size to filter out iPhones and Gmail Webmail."
  },
  {
    "key": "1501862928a850d6",
    "client": "Outlook",
    "status": "working",
    "code": "#converted-body .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "0fb87cb61fed57c5",
    "client": "QQ mail",
    "status": "working",
    "code": "#mailcontent .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "`.mailcontent` also works as well as combining both `#mailcontent.mailcontent`.\n\nThis has only been tested in Android so far but may work on other platforms. Please let us now if you are able to test it."
  },
  {
    "key": "91ba946d836584c9",
    "client": "Samsung Email",
    "status": "working",
    "code": "& #MessageViewBody .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "177434d53f8ea0fe",
    "client": "Samsung Email",
    "status": "working",
    "code": "# #MessageViewBody .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": ""
  },
  {
    "key": "c21054b29af8d30e",
    "client": "Mailspring",
    "status": "working",
    "code": "#inbox-html-wrapper .your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "This must be placed in the `<body>` of the message as the `<head>` gets removed."
  },
  {
    "key": "641ac2f0dcb30a20",
    "client": "Free.fr",
    "status": "working",
    "code": ".v1your-class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "or\n\n```css\n[class=\"v1your-class-name\"] {\n  /* Replace this comment with your styles */\n}\n```\n\nFree.fr prepends `v1` to class names"
  },
  {
    "key": "6ae71bb967ee7471",
    "client": "Notion mail",
    "status": "working",
    "code": "#mail-content-wrapper .class-name {\n  /* Replace this comment with your styles */\n}",
    "notes": "or\n\n```css\n#mail-content-container .class-name {\n  /* Replace this comment with your styles */\n}\n```"
  },
  {
    "key": "5a3939ba48d8fc9a",
    "client": "Onet",
    "status": "working",
    "code": "#ReadMailMainWrapper .your-class-name {\r\n  /* Replace this comment with your styles */\r\n}",
    "notes": ""
  },
  {
    "key": "4d3c98208e210f0e",
    "client": "Outlook",
    "status": "working",
    "code": ".your-class-name.x_chained-class-name {\n  /* Styles for outlook webmail only */\n}\n.your-class-name.chained-class-name {\n  /* Styles for everyone else */\n}",
    "notes": "```html\n<div class=\"your-class-name chained-class-name\">\n  <!-- Your code -->\n</div>\n```\n\nOutlook webmail (desktop and mobile) prefixes all class names with `x_`. It does this in the class attribute of html elements as well as class definitions in `<style>` blocks. However, in the `<style>` blocks it does it only on the first class name of chained classes: `.your-class-name.x_chained-class-name` will be changed to `.x_your-class-name.x_chained-class-name`. On the element `<div class=\"your-class-name chained-class-name\">` will be changed to `<div class=\"x_your-class-name x_chained-class-name\">` by Outlook webmails pre processor. \nThis approach allows us to build a exclusive targeting which is helpful to tackle the `box-sizing:border-box !important;` style attribute which Outlook webmail adds on elements having widht / height AND paddings defined as we can set the width / heigth for border-box calculation for Outlook webmail only."
  },
  {
    "key": "90329e7dfdec5777",
    "client": "Proton Mail",
    "status": "working",
    "code": "#proton-root .your-class-name {\r\n  /* Replace this comment with your styles */\r\n}",
    "notes": ""
  }
];

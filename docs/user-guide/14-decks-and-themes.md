<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/decks/**, apps/web/src/app/themes/**, apps/web/src/decks/**, apps/web/src/canvas/**, apps/web/src/components/theme-picker.tsx, apps/web/src/components/theme-scope.tsx -->
# Decks and Themes

A **Deck** is a set of slides you build from your Widgets, text, arrows and shapes. You can present it in Ziffr, or export it as PowerPoint or PDF for a board meeting. A **Theme** decides how your dashboards and decks look: colours, fonts, cards and what every slide shows.

Open **Decks** in the top bar. Owners, Admins and Members can make decks. Guests only see decks that someone shared with them. The **Themes** page opens from the **Themes** link on the Decks page, or next to the theme picker on any deck or dashboard. Everyone can look at it, but only Owners and Admins change themes.

## The Decks page

The page lists every deck you made and every deck someone shared with you. Each card shows the deck's name, how many slides it has and when it was last changed. On a deck from someone else, the card also says who it is from and what you may do: "you can edit it" or "you can present it".

- **Open a deck** by choosing its card. If you may change it, the deck opens in the editor. If you may only present it, it opens for presenting.
- **Make a new deck**: type a name in **Name of the new deck** and choose **New deck**. The deck opens in the editor and starts with one title slide.
- **Make a deck from a Deck Template**: choose **From a Deck Template**, pick a template, and pick a Metric for each of its Slots, once even when several slides show it. The button shows when your team has saved a Deck Template. The new deck is yours: it starts with the template's slides, its words filled in from today's data, and the template's Theme if the Workspace still has it. Changing the deck never changes the template.
- **Make a deck from a dashboard**: on a dashboard, open the **⋯** menu and choose **Make a deck**. The new deck has the dashboard's name. It starts with a title slide showing the dashboard's name and introduction, then one slide for each Widget, in the dashboard's reading order. Each slide is titled with the Widget's own title, or else its Metric's name.

If you follow a link to a deck that is not shared with you, Ziffr says "This deck isn't shared with you" and lets you ask its owner for access.

## The deck editor

The editor has three parts: a row of buttons at the top, a side panel on the left, and the deck canvas, where your slides sit.

Changes save by themselves a moment after you make them. Next to the deck's name you see **Saved**, **Saving…** or **Unsaved changes**. To rename the deck, click its name at the top and type. On a narrow screen the buttons move to a second line before the name is cut short.

The panel of colours, sizes and fonts opens at the top right of the canvas only while something is selected or a drawing tool such as the rectangle is chosen; with nothing selected the slide stays clear.

### The buttons at the top

| Option | What it does |
|---|---|
| **+ Slide** | Adds a new slide at the end. Pick a layout (see below) or one of your team's layouts. |
| **Group** and **Ungroup** | Keep several selected things on one slide together, or split a group again. Only things on the same slide can be grouped. The shortcuts are Ctrl+G and Ctrl+Shift+G (⌘G and ⌘Shift+G on a Mac). |
| Theme picker (the palette icon) | Chooses the deck's Theme. **(team default)** follows whatever theme the team uses by default. |
| **Who can see this** | Lists everyone who can open the deck, and why. |
| **View link** | Makes a link for someone outside the team. Only the deck's owner sees this button. |
| **Share** | Shares the deck with people or Groups. Only the deck's owner sees this button. |
| **Versions** | Shows earlier states of the deck and lets you go back to one. |
| **Save as Deck Template…** | Saves every slide as a team Deck Template (see below). Only the deck's owner sees this button. |
| **Present** | Shows the deck one slide at a time, filling the screen. |
| **PDF** | Prepares a PDF to print or save. |
| **Export PowerPoint** | Downloads the deck as a PowerPoint file. |

### Slide layouts

**+ Slide** offers these layouts. Each one only places starting text, which you can change or delete.

| Layout | What you get |
|---|---|
| **Title slide** | A title and a subtitle. |
| **Title and content** | A title over one large area for a Widget. |
| **Two widgets** | A title over two side-by-side areas. |
| **Section header** | One large line that opens a section. |
| **Blank** | Nothing but the slide. |

Below them, under **Team layouts**, you find slides that people in your team saved (see [Saving a slide as a layout](#saving-a-slide-as-a-layout)). Each shows who made it. If a team layout has Slots, Ziffr first asks which Metrics should fill them. Its words are then filled in from today's data.

### Slides and their order

A **Slide** is one 16:9 page of the deck. New slides go below the last one. You can drag slides around on the canvas like any other object.

The order of the slides is their position on the canvas: left to right, then top to bottom. That order is used when you present, when you export and for the slide numbers. To move a slide earlier, drag it above or to the left of the slide it should come before.

### Adding Widgets

The **Pool** on the left holds the Metrics you can see, your saved Widgets and the Widget Templates. Drag one onto a slide, or choose **+** next to it to add it to the slide you are looking at. It lands in the first free space on that slide, next to what is already there; if the slide is full, it is made smaller to fit.

- A Metric dropped on a slide becomes a line chart. You can change that afterwards.
- A Widget Template asks for its Metrics first.
- A Widget shows live numbers: whenever a new value arrives, the slide shows it.

You can only place Metrics you may see. Everyone you share the deck with can see the Metrics on its slides.

### Text, arrows, shapes and images

The toolbar at the bottom of the canvas has the tools for text, arrows, lines, shapes, sticky notes and free drawing. Text and lines start in plain type with solid lines.

You can paste or drop an image file onto a slide. Links cannot go on a slide: Ziffr shows "Links can't go on a slide", because a link would load from another site every time the slide is shown. Paste or drop the image itself instead.

### The side panel

What the side panel shows depends on what you have selected.

**A Widget selected.** The **Visualization** list changes how the Widget draws its Metric, with the same choices as on a dashboard. The note below it reminds you which ones become editable charts in PowerPoint. A Widget drawn by one of the Workspace's View Designs keeps its design on the slide, titled by the design's name when it is an Analysis. When the Widget is a **Finding**, its editor opens below, so you can change its headline, words and panels.

**A slide selected.** Click the edge or the name of a slide to select it.

| Option | What it does |
|---|---|
| **Hide logo, footer and number on this slide** | Leaves this slide without the logo, footer and slide number that the Theme puts on every slide. Useful for full-bleed title or image slides. |
| **Save slide as layout…** | Saves this slide for the whole team (see below). |

**Always shown: Footer on every slide.** Type a footer for this deck only, such as "Board meeting, confidential". Leave it empty to use the footer of the deck's Theme. The logo, slide numbers and type sizes always come from the Theme.

### Saving a slide as a layout

Select a slide and choose **Save slide as layout…**. Give it a name and, if you like, a description. The Metrics on the slide become Slots, so others can fill the layout with their own Metrics. Everyone in the team can use the layout from **+ Slide**, under **Team layouts**. Only you can change it.

### Saving a deck as a Deck Template

A **Deck Template** keeps a whole deck: every slide with its Widgets, words and boxes, with the Metrics left open as Slots. Choose **Save as Deck Template…** at the top. A Metric shown on several slides becomes one Slot, which you can name, such as "Revenue". Its name in the words becomes {metric}. Notes tied to one period or row can follow a rule instead, or are left out, as for a layout. Images and links stay behind. You can do this for a deck of your own once it is saved, when you see every Metric on it. Everyone in the team can then start a deck from it on the Decks page; only you can change or replace it.

## Presenting

Choose **Present** to show the deck one slide at a time, filling the screen, with live numbers. Nobody can change the deck while it is presented.

- **Next slide**: the right arrow, down arrow, Page Down or the space bar, a click on the right part of the slide, a swipe, or **›** at the bottom.
- **Previous slide**: the left arrow, up arrow, Page Up, a click on the left part of the slide, a swipe, or **‹**.
- **First and last slide**: Home and End.
- **Full screen**: the button at the bottom right. **Stop presenting** (the **×**) or Escape takes you back to the editor.

The bar at the bottom shows the deck's name and which slide you are on, such as "3 / 12".

People you shared the deck with as Viewers always open it this way.

## Exporting to PowerPoint and PDF

An exported deck is a **Snapshot**: it holds the values its Widgets show at the moment you export. Every slide carries the stamp "Data as of" and that day's date, so readers know how old the numbers are. The deck in Ziffr stays live.

Slides are exported in their order on the canvas. Each export is noted in the workspace's Audit Log.

### Export PowerPoint

Choose **Export PowerPoint**. Your browser downloads a file named after the deck.

- Text, shapes and arrows become normal PowerPoint objects you can edit.
- Line and bar Widgets, and Findings with ranked bars, become real PowerPoint charts you can edit. Their values are rounded to the Metric's decimals the way Ziffr shows them: 1.005 at two decimals is 1.01.
- Number Widgets become text, and history tables become tables. Values are written as in Ziffr, in the Workspace's Number Style with the Metric's unit. Under the value stands the Widget's first comparison, exactly as the Widget shows it, such as "vs prev. +4.2 %". When the Widget shows "n/a", for example because the period before has no value, the slide shows no change.
- Chart values are rounded to the Metric's decimals and labelled with its unit, a negative one with the minus sign "−" as in Ziffr. PowerPoint writes their digits the way the computer that opens the file does. The values behind the chart stay plain numbers, so editing its data in PowerPoint works as usual.
- A Widget shown by quarter or year (**Show by**, see the Dashboards chapter) exports the same quarters or years, with the one still running labelled "to date", and a past one that lacks some of its values labelled "only 2 of 3 months" (shown without a change against it).
- Gauges, analyses and everything else go in as pictures. Ziffr decides this from what the Widget's View Design draws, so a View Design your Workspace added becomes an editable chart, text or table by the same rules: a single line or bars of the values, the latest value with its period, or a list of values.
- The Theme's background, logo, footer and slide number are set up once for the whole file, so changing them in PowerPoint changes every slide.
- The Theme's fonts are named so PowerPoint can find them. If a computer does not have a font, PowerPoint uses a similar one.

### PDF

Choose **PDF**. Ziffr opens the deck in a new browser tab and starts printing. Choose "Save as PDF" in the print window to keep a file. Each page shows "Data as of", the date and the slide number. If nothing opens, allow pop-ups for Ziffr in your browser.

If an export fails, Ziffr says "Export failed". Try again, or remove the last thing you added.

## Sharing a deck

Sharing a deck works like sharing a dashboard. [Dashboards and Findings](12-dashboards.md) explains Shares, View Links and Versions in full. In short:

- **Share** gives people or Groups a role on the deck. A **Viewer** can present it. An **Editor** can also change its slides, name, footer and Theme. Only the owner shares the deck and makes View Links.
- **View link** lets someone outside the team watch the deck slide by slide, without signing in. Under **For**, say who it is for; under **Works until**, choose when it ends (at most 90 days ahead). Tick **Freeze today's numbers** to keep the values as they are now; otherwise the link shows live numbers until it ends. You can copy or revoke each link.
- **Versions** keeps earlier states of the deck. Going back to one makes a new version.

## The Themes page

The page shows every Theme of the Workspace on the left. The one marked **team default** is used everywhere a dashboard or deck has not picked another. Choose a theme to see and change it.

On the right, a preview shows a sample slide and real Widgets drawn with the first Metrics you can see, so you judge a theme on what it will really show. The preview changes as you edit, before you save.

If you are not an Owner or Admin, the page says "Only owners and admins of the workspace change themes. You can pick one for your dashboards and decks." You can still look at every theme and its Versions.

### Name and colours

| Option | What it colours |
|---|---|
| **Name** | The theme's name, as shown in the theme picker. |
| **Behind the cards** | The background behind Widgets. |
| **Cards and slides** | The Widgets' cards and the slides. |
| **Text and values** | Text and numbers. |
| **Labels and axes** | Labels and chart axes. |
| **Lines and grid** | Lines and grid lines. |
| **Highlight** | Things picked out for attention. |
| **Good** | Values that are good, according to the Metric's Polarity. |
| **Bad** | Values that are bad. |
| **Target band** | The band that shows the Target Range. |
| **Data, first for single series** | Four colours for the lines and bars of charts. The first is used when a chart shows only one Metric. |

### Fonts and cards

| Option | What it does |
|---|---|
| **Headlines** | The font for headlines. |
| **Text** | The font for ordinary text. |
| **Figures** | The font for numbers. |
| **Corners** | How round the corners of cards are, from 0 to 16 pixels. |
| **Cards** | How cards are drawn: **Paper, soft shadow**, **Flat, hairline edge** or **Plain, no edge**. |

The fonts to choose from are General Sans, Inter, IBM Plex Sans, Libre Franklin, Source Serif, Playfair Display, Georgia, Arial, Geist Mono and IBM Plex Mono.

### Slides

These settings decide what every slide of a deck in this theme shows. A slide can hide them with **Hide logo, footer and number on this slide**, and a deck can set its own footer.

| Option | What it does |
|---|---|
| **Add logo** / **Replace logo** | Puts your logo on every slide. Use a PNG, JPEG, WebP or SVG image under 1 MB. The bin icon removes it. |
| Logo position | **Top left**, **Top right**, **Bottom left** or **Bottom right**. Shown once there is a logo. A logo at the bottom left takes the footer's place, and a logo at the bottom right takes the slide number's place. |
| **Logo width** | How wide the logo is, from 40 to 400 pixels. |
| **Background image** / **Replace background** | An image behind every slide, filling it. Use a PNG, JPEG, WebP or SVG image under 2 MB. The bin icon removes it. |
| **Footer** | A line at the bottom left of every slide, such as "Company name, internal". |
| **Numbers** | Shows the slide number at the bottom right. |
| **Title px** | The size of slide titles, from 24 to 96. |
| **Body px** | The size of body text, from 12 to 48. |

The type sizes apply to new slides you add. Slides that already exist keep the size their text has.

### Saving and managing themes

| Option | What it does |
|---|---|
| **Save theme** | Saves your changes. Every dashboard and deck using this theme changes with it. |
| **Discard** | Throws away the changes you have not saved. |
| **Make team default** | Makes this theme the one used everywhere nothing else was picked. |
| **Duplicate** | Makes a copy of this theme. This is how you start a new theme. |
| **Versions** | Shows earlier states of the theme and lets you go back to one. Open to everyone. |
| **Delete** | Deletes the theme after you confirm. Dashboards and decks that used it switch to the team default. The team default itself cannot be deleted: make another theme the default first. |

Only Owners and Admins see **Save theme**, **Make team default**, **Duplicate** and **Delete**.

Ziffr's own screens, such as menus, settings and this guide, keep their look whatever theme you pick.

## Picking a theme for a dashboard or deck

Every dashboard and deck has a theme picker, shown with a palette icon. The first choice is the team default, shown with its name and "(team default)". A dashboard or deck on that choice follows the team default, even when the default changes later. Any other choice sticks to that one theme.

Whoever may change the dashboard or deck may pick its theme: its owner and its Editors. Viewers see it in the theme that was picked. The **Themes** link next to the picker opens the Themes page.

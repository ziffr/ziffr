<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/settings/packs/** -->
# Packs

A **Pack** is a file of ready-made things for a Workspace: Metric Catalog entries, Dashboard and Deck Templates, Workflow Templates, View Designs, Analysis Recipes and Themes. It holds no code. Open **Workspace → Packs**.

## The installed Packs

**Installed in this Workspace** lists each Pack with its version, author and license, whether it was an uploaded file, when and by whom it was installed, and what it added: its Metric Catalog entries, templates, designs and Themes. A Pack's own page and help page open as plain links, when it has them; for a Pack that came as a file, not from the Marketplace, the link names its site and says the Marketplace did not check it. Owners, Admins and Members see the list; Guests see no Packs.

Each Pack shows "by" its author, with its logo when it has one, in a bordered box next to the name, and says who vouches for both. A Pack installed from the Marketplace says **Published through the Marketplace as @handle**; that is all its signature proves, so it does not say the name or logo were reviewed. A Pack installed from a file says **Uploaded file. The Marketplace did not check it. Its name and logo are what the file says about itself.**, shows the id as the file writes it, and, when the id begins with `ziffr/`, adds **This file says it is from Ziffr. It is not signed by the Marketplace.** There is no badge: read the lines. The logo is shown only here, in the install preview and on the update page, never anywhere else in Ziffr.

## Installing from a file

Ziffr makes starting Packs: SaaS metrics, Online shop, Agency or freelancer, Sports club and a Board meeting deck, and five for the functions of a business that any company can use: Sales, Finance, People and HR, Customer support, and Operations and fulfilment. Each brings its Metrics, a dashboard and a Workflow, and names the ready n8n templates that can fill them. Their files are in the `packs` folder of Ziffr's repository; download one and install it as below.

**SaaS metrics** is the fullest: 13 Metrics with Tags, a monthly management report (a dashboard and a deck), a quarterly board deck, Workflows for the monthly and the quarterly close, an Analysis Recipe with its View Design, and a Theme that shows the Pack's logo. It holds a Theme, so an Owner installs it. **Set up from this Pack** makes its Metrics, the monthly dashboard and a close Workflow in one go; the decks start from **From a Deck Template** on the Decks page, with the Pack's Theme already chosen.

**Install a Pack from a file** is for Owners and Admins. A Pack that holds Themes needs an Owner, since only Owners change Themes. The demo installs no Packs and opens none.

1. Choose **Choose a Pack file…** and pick the Pack's file (at most 1 MiB). Ziffr checks the whole file before it shows anything. If something in it is wrong, it lists every problem with its line, and installs nothing.
2. Ziffr shows the Pack: its name, version, summary, author with its logo and who vouches for them, license, and every item it adds. A Theme that comes with the Pack's logo says so. Dashboard Templates and View Designs are drawn with Sample Data, never your own values; Themes show their colours.
3. It says **Uploaded file. The Marketplace did not check it.** Tick **I install a file the Marketplace did not check.**
4. If any text in the Pack reads like an instruction to an AI assistant, such as "ignore your instructions", Ziffr lists each one. Assistants connected to the Workspace read Metric descriptions, but can only do what their key allows. Read them, then tick **I read the words aimed at assistants.**
5. Choose **Install**. The Pack is installed whole or not at all, and the Audit log records it.

Installing makes no Metric, Workflow, dashboard or deck, sends nothing and changes nothing already in the Workspace. Its Metric Catalog entries appear under **New metric** (a Derived Metric's entry only through **Set up from this Pack**, below), its templates where you start a dashboard, deck or Workflow, its View Designs under **Analyze → View Designs** (an Analysis Recipe as a View Design that draws it), and its Themes on the Themes page. Two Packs may describe the same Metric, such as Revenue: the Metric Catalog then lists both, each under its Pack. A Pack that is installed already is not installed again: update it instead.

## Set up from this Pack

Installing adds only entries and templates. **Set up from this Pack**, under an installed Pack, turns them into things you use. It is for Owners and Admins.

The form opens with the whole Pack chosen: every Metric ticked, the dashboard and the Workflow picked when the Pack has exactly one of each, and, when you are the only member of the Workspace, you as the Approver when its Approve step asks for just one. Press **Set up** to take it all, or untick and change what you do not want. When the Workspace has other members, Approvers start empty: you pick them.

| Control | What it does |
| --- | --- |
| **Metrics to make** | One box per Metric Catalog entry of the Pack. A Derived Metric, such as Average order value, is computed from other entries; ticking it ticks those too, and they are made first. |
| **Tags on an entry** | An entry may bring up to 5 Tags, shown under its name. The Metric made from it gets them, matched by name with the Tags the Workspace has (so `finance` and `Finance` are one Tag, in its first spelling) and new ones made. If a limit is reached (10 Tags on a Metric, 200 in the Workspace) the Metric is still made, and the result says which Tags stayed off it: merge or delete Tags you do not need, then add them by hand. |
| **Ask me for their values** | Makes you the Submitter of the Metrics that take values, and sends you a first request for each now. Untick it to add Submitters later on each Metric's page. |
| **Values come from the Feed** | Shown when the Workspace has a Feed. Makes that Feed the Submitter of every Metric that takes values and turns on the API Source, so a program such as the [Usage Feed](../guides/usage.md) fills them and nobody is asked. Only Feeds of this Workspace are offered. |
| **Dashboard** | One of the Pack's Dashboard Templates, or none. Each Slot is filled with the Metric made from the entry it suggests; a Slot whose entry you do not make asks you to pick one of your Metrics. |
| **Workflow** | One of the Pack's Workflow Templates, or none. If its Approve step asks for Approvers, pick each one, members of the Workspace. The Metrics that take values follow this Workflow. |
| **How many Metrics it makes** | A line at the top of the form, which changes with every box: "Makes 18 Metrics: 20 of 50 left in Size Small afterwards." The Metrics made for a Derived Metric are counted. If the set goes past what the Size holds but within its room, the line says by how many, and that the 14 days over the limit start. If it does not fit at all, the line says how many do, and **Set up** waits: untick some entries, archive Metrics you no longer track, or follow **change the Size** to [Size and usage](16-workspace-settings.md#size-and-usage). Where the limit has no Size name (a trial's 25, or one your Installation Admin set), the line says "the limit". |
| **Set up** | Makes it all. Ziffr checks everything first: if anything cannot be made, such as more Metrics than the Workspace's limit (see [Size and usage](16-workspace-settings.md#size-and-usage)) or a trial's 25, nothing is made and it says why. |

When Set up has made Metrics that take values, its result page offers **Fill from n8n** for them: the same download as under a Metric's **Who submits**, for all those Metrics at once, with a starter sheet naming each Metric's slug. When the Pack says which template fills which of its entries, the page reads "HR Pack says Google Sheets can fill Headcount, Attrition" with the template already chosen, one button per template. Metrics computed from others are left out, since they take no values.

What it makes are ordinary Metrics, a dashboard and a Workflow, as if you made them by hand: each counts towards the limit, is in the Audit Log, and stays as it is whatever happens to the Pack later. A Metric remembers the Pack's entry it came from. The same holds for a Metric you start from a Pack's entry under **New metric**: it gets the entry's Tags, and the Metric's page says if a limit kept some off.

## From the Marketplace

When an Installation Admin turned on the Marketplace connection, Owners and Admins see **From the Marketplace**: search free Packs by a word, and choose **See what it adds** to see one drawn with Sample Data. A Pack from the Marketplace says so ("its signature holds") and needs no warning about where it came from; texts aimed at assistants are still listed and need a tick. Installing works as from a file. Once a day Ziffr asks which installed Packs have newer versions; an installed Pack with one shows **Version … on the Marketplace…**, which shows what an update changes before it is done.

## Updating a Pack

Owners and Admins see **Update from a file…** on each installed Pack (an Owner, when it holds Themes). Choose the newer file: its version must be higher than the one installed. Ziffr checks the whole file and lists every item with what the new version does to it (added, changed, removed or the same) and what happens here:

- an item nobody changed is replaced by the new version;
- an item you changed, such as a renamed Dashboard Template or an edited Theme, stays as you made it, and the new version is offered beside it;
- an item the new version drops is removed, or kept without being marked as from the Pack when you changed it or something uses it;
- an item you removed is not added again.

When the new version has another logo, or none, the update page says **The logo changed** and shows the old and the new one side by side. A Theme nobody changed here gets the new logo with the replacement; one you changed keeps what it has, and a logo you set yourself is never replaced, also when you take the new version. Where you removed the Pack's logo, it stays removed.

A new major version, such as 2.0.0 after 1.4.0, says first that it may change how things look or work. Confirm the same warnings as when installing and choose **Update to …**. The update happens whole or not at all, and the Audit log records it. Metrics, dashboards, decks and Workflows made from the Pack never change.

**New versions offered**, at the top of the page, lists the items you changed that have a newer version waiting. **Take the new version** replaces yours with it; yours stays in its **Versions**, so you can bring it back.

## Uninstalling a Pack

**Uninstall…** first lists what goes and what stays. It removes every item nobody changed and nothing uses. It keeps, no longer marked as from the Pack, every item you changed and every Theme a dashboard, a deck or the Workspace's default uses. Metrics made from its catalog entries, and everything else made from the Pack, stay as they are. When a kept Theme still shows the Pack's logo, the window says so and offers **Also remove the author's logo from this Theme**, ticked by default: the Pack that brought the logo is gone. A logo you chose yourself always stays. The Audit log records it, with how many Themes lost the logo.
## Export as Pack

**Export as Pack…** is for everyone but Guests. Pick Metrics, Metric Catalog entries from Packs, Dashboard, Deck and Workflow Templates, View Designs and Themes; name the Pack, give it an id such as `northwind/saas-metrics`, a version, a summary, an author and a license; then choose **Download Pack**. The file holds descriptions and layouts, never a value or a person, and only Metrics you see. Tags of the Metrics you pick go in too, up to 5 per entry and only Tags you see on those Metrics, never a Tag of a Metric you did not pick; untick **Carry the Tags of the Metrics you pick** to leave them out. Anything a Pack may not hold, such as a description with a web address or a drawing on a slide, stays out, and the window lists it with the reason.

The **Author** starts as your name; change it to your company's if the Pack is theirs. It is the publisher the Pack is shown with. Under **Logo (optional)** you can take the logo of one of your Themes or upload a picture (PNG, JPEG or plain SVG, at most 128 KB and 512 pixels on a side); the window shows it in a box, as the Packs page will. Themes that use that logo carry it into the Pack; a Theme with another logo keeps it out of the file, and the window says so. Use only a logo you may share: it stays yours, and the Pack's license does not cover it. See [Writing a Pack](../guides/packs.md) and [For creators](../guides/pack-creators.md).

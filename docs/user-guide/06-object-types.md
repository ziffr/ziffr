<!-- part: Understanding Ziffr -->
# Everything you work with

This chapter lists the kinds of things you meet in Ziffr, what each one is for, and who may make one. Use it as a reference when a word in the app is new to you.

## The numbers

| Thing | What it is | Who makes it |
| --- | --- | --- |
| **Metric** | A named, fully described number tracked over time, such as "Revenue" or "Open tickets" | Owners, Admins and Members |
| **Derived Metric** | A Metric worked out by a formula from other Metrics, such as "Gross margin" | No screen yet: the demo shows some |
| **Observation** | One value of a Metric for one period: "Revenue, October: 84,000 €" | Its Submitters |
| **Breakdown** | Labelled values that split one Observation, such as revenue by country | Its Submitters, together with the value |
| **Target Series** | Targets for individual periods, such as a monthly budget | The Metric's Owner and Editors |
| **Projection** | A value expected for a future period, always shown as a projection | The Metric's Owner and Editors |

## Seeing the numbers

| Thing | What it is | Who makes it |
| --- | --- | --- |
| **Widget** | One Metric drawn in a chosen way (a number, a line, bars, a gauge, a table) with its settings | Anyone who may create |
| **Finding** | A Widget set as an editorial graphic, with a headline that states what happened, a subline, notes and a source, around one or more charts | Anyone who may create |
| **Dashboard** | A page of Widgets and Findings that you arrange and share. It reads two ways: *Grid*, as arranged, and *Read*, one Widget below the other like an article, good on a phone | Owners, Admins and Members |
| **Home dashboard** | The dashboard Ziffr opens on for you; you choose it yourself | Everyone, for themselves |
| **Snapshot** | What a dashboard showed for one week, month, quarter, half-year or year, fixed so its numbers never change afterwards. A Snapshot can carry its own words, such as the explanation for the board | The dashboard's Owner and Editors |
| **Analysis Canvas** | A space where you drop one or more Metrics and run analyses on them, such as a forecast or a correlation | Anyone who may create |
| **Deck** | An ordered set of 16:9 slides built from Widgets, text, arrows and shapes, exported as PowerPoint or PDF | Owners, Admins and Members |
| **Theme** | The look of everything that shows numbers: colours, fonts, logo, footer | Owners and Admins |

## Getting the numbers in

| Thing | What it is | Who makes it |
| --- | --- | --- |
| **Workflow** | The path a value takes each period: ask, remind, escalate, check, approve, lock. Several Metrics can share one | Owners, Admins and Members |
| **Prompt** | The scheduled message asking for a value: "How many deals today?" | Ziffr, from the Workflow |
| **Connector** | A link to an outside service, such as email or Slack, through which Ziffr reaches people | Owners and Admins connect it |
| **Source** | A way a Metric accepts values: form link, email, Slack, the API | The Metric's Owner and Editors turn it on |
| **Feed** | A program that brings in values from another system, such as a CRM | Owners and Admins |
| **Approval** | Confirming, correcting or sending back an Unusual Value | The Approvers in the Workflow |
| **Lock** | A finished period that takes no more values without Approval | The Workflow, or the Metric Owner |

## Talking about the numbers

| Thing | What it is | Who makes it |
| --- | --- | --- |
| **Question** | An Action that is done once the Assignee has answered it | Anyone who can see the value |
| **Task** | An Action that is done once the Assignee has carried it out, optionally with a due date | Anyone who can see the value |
| **Thread** | The replies between the asker and the Assignee | The people on the Action |
| **Correction** | A change to a value proposed in a Thread; it counts once the Metric Owner accepts it | The people on the Action |

## People and access

| Thing | What it is | Who makes it |
| --- | --- | --- |
| **Workspace** | One team's own space, with its people, Metrics, dashboards, decks and settings | Anyone who signs up |
| **Member, Guest, Admin, Owner** | The Workspace Roles: what a person may do in the Workspace as a whole | Owners and Admins assign them |
| **Contact** | A person without a login who sends in values, such as an outside bookkeeper | Owners and Admins |
| **Invitation** | An offer to join the Workspace, by email or as a link | Owners and Admins |
| **Group** | A named set of people, such as "Management", to share things with. Every Workspace also has "Everyone in the workspace" | Owners and Admins |
| **Share** | Giving a person or a Group access to a Metric or a dashboard, as a Viewer or an Editor | The thing's owner |
| **View Link** | A link that shows one dashboard or deck to someone outside the team, without a login, until a set date | The dashboard's or deck's owner |
| **Stand-in** | The person asked instead of a Submitter who is Away or has not answered by the Due Date | The Metric Owner, per Submitter |
| **Away** | The dates a person is not available; their Prompts go to their Stand-in meanwhile | Each person for themselves, or Owners and Admins |
| **Access Key** | A secret that lets a program act for a person, for chosen actions only, until a set date | Each person, for themselves |
| **Feed Key** | An Access Key that acts for a Feed instead of a person | Owners and Admins |

## Keeping track

| Thing | What it is | Who sees it |
| --- | --- | --- |
| **Version** | A saved state of something people build, with its author and time, which you can restore | Whoever may see the thing |
| **Superseded Value** | An earlier value, kept when it was replaced or corrected | Whoever may see the Metric |
| **Outbox** | Every message Ziffr sent, with where it went and whether it arrived | On the Connectors page |
| **Changes** | What happened recently in the Workspace | Everyone in the Workspace |
| **Audit Log** | Who changed who may see or do what, and the decisions taken on numbers. Nobody can change it; it is kept for two years unless this Installation sets otherwise | Owners and Admins |
| **Access Log** | Every call a program made with an Access Key | Owners and Admins, and each person for their own keys |

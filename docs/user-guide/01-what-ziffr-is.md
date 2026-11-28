<!-- part: Understanding Ziffr -->
# What Ziffr is

Ziffr is one place where a small team keeps its business numbers: revenue, new customers, open tickets, cash in the bank, customer satisfaction, hours worked. It collects each number from whoever knows it, keeps every value over time, and lets the team look at the numbers, talk about them and act on them.

## The problem it solves

In most small companies the important numbers are scattered. Some sit in the accounting tool, some in the shop system, some in a spreadsheet on someone's laptop, and some only in a colleague's head. Every month someone sends emails asking for them, copies them into a slide, and hopes nobody typed a wrong digit. When a number looks odd, the discussion happens in a chat that nobody can find three months later.

Ziffr turns that into a routine that runs by itself:

- **Every number is described once.** What it means, how it is counted, how often, what a good value is, and who is responsible for it.
- **Ziffr asks for the numbers.** On the right day, through the channel each person already uses (email, Slack or a personal form link), and it reminds them when a number is late.
- **Unusual values are checked.** A number that jumps or falls outside its target is approved by a person before it counts as final.
- **Finished periods are locked.** Once a month is closed, its numbers stay as they are. A late correction waits until the Metric's owner accepts it.
- **Everyone sees what they may see.** Dashboards, decks and comparisons show each person only the numbers shared with them.
- **Questions stay with the number.** "Why is cost so high in March?" is asked on the March value itself, and the answer stays there.

## Who it is for

Ziffr is built for teams of roughly five to a hundred people who want a clear view of how the business is doing without hiring a data team. Typical users are founders and managing directors, team leads who report their numbers each month, finance and controlling, and outside people such as a bookkeeper or a field worker who only send in one number now and then.

## How Ziffr is different

### From a business intelligence tool

Business intelligence tools, such as Power BI, Tableau or Looker, are very good at drawing charts from data that already exists in a database. They assume someone has already collected, cleaned and modelled that data, and usually an analyst builds the reports.

Ziffr starts one step earlier. Many of the numbers a small team cares about are not in any database: they have to be asked for. Ziffr does the asking, checks the answers, and keeps a clean history. Its dashboards and decks are made by dragging and dropping, for people who are not analysts. Where a number does live in another system, a Feed brings it in automatically.

| | Business intelligence tool | Ziffr |
| --- | --- | --- |
| Starts from | Data that already sits in databases | The number you want to track, wherever it lives |
| Gets the numbers by | Reading databases | Asking people, and reading other systems through Feeds |
| Built by | Analysts and data engineers | The team itself |
| Checks the numbers | Rarely, in the data before it | Unusual Values are approved, closed periods are locked |
| Talks about the numbers | In email or chat, elsewhere | Questions and tasks on the value itself |

### From a data warehouse

A data warehouse stores large amounts of raw records from many systems, every order and every click, so that specialists can analyse them. It needs engineers to build and maintain it.

Ziffr keeps only the numbers that matter for running the business, one value per period, with their targets, history and the decisions taken on them. It is not a place for millions of rows. If your company has a warehouse, Ziffr sits on top of it: a Feed reads the finished numbers from the warehouse and records them in Ziffr, where the rest of the team can see and discuss them.

### From a spreadsheet

A spreadsheet is flexible, but it does not ask anyone for a number, does not remind them, does not notice when a value looks wrong, and does not remember who changed what. Sharing one part of it with one person and another part with someone else is hard. Ziffr keeps every earlier value when one is replaced, records every change to who may see what, and shares each number on its own.

### From a project or task tool

Ziffr has questions and tasks, but only about numbers: each one is attached to a value or a time range of a Metric. It does not replace your project tool; it makes sure the conversation about a number stays next to that number.

## What Ziffr is not

- It is not an accounting system. It does not book transactions; it keeps the totals your accounting produces.
- It is not a database for raw data. Each Metric has one value per period, optionally split into a Breakdown, such as revenue by country.
- It does not run other people's programs. A Feed that reads your CRM runs on your side and only sends finished numbers to Ziffr.

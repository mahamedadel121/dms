# Open questions for the business owner

None of these block the build; each has a working default (see `docs/DECISIONS.md`). Answers change configuration or small pieces of code.

## Accounting and SAP

1. **GL accounts.** Only two were given (51501800 maintenance, 51501500 spare parts). What are the GL numbers for road tolls, weighbridge, traffic fines, diesel, tips and "other"? The seed uses placeholders.
2. **SAP posting parameters.** Company code, document type, posting keys, fiscal year variant, and the cash GL account of each treasury?
3. **Daily treasury.** Is cash managed through the Cash Journal (FBCJ)? If yes, the posting must go through a Cash Journal adapter instead of a plain journal entry.
4. **SAP connection.** S/4HANA on-premise or cloud? Is the SOAP Journal Entry service (`JournalEntryCreateRequestConfirmation_In`) activated, and who provides the communication user and endpoint? Until then the system runs with the mock or the file-export adapter.
5. **Aggregation.** Should lines with the same GL account and cost center be merged into one debit item, or posted line by line? (Default: line by line.)
6. **Document date.** Payment date or submission date? (Default: payment date.)
7. **Disallowed expenses.** May an accountant reduce a line to zero, or must he reject the whole request? (Default: zero is allowed and the line is left out of the SAP entry.)
8. **Partial payment.** Can the treasury pay only part of a request? (Not supported: payment is all or nothing.)
9. **Reversal.** If a paid request turns out to be wrong, who reverses it and where? (Not in this phase; reversal is done in SAP.)

## Workflow

10. **Maintenance Engineer and Shipping Officer together.** Do they approve in parallel (default) or one after the other?
11. **Who acts after a correction?** The request returns to the same step; any holder of that role may continue. Should it be restricted to the person who asked?
12. **Send-back.** Should a sent-back request require every approver of the previous stage to approve again? (Default: yes.)
13. **General Manager threshold.** Should the General Manager see every request, or only those above an amount? (Default: every request; a threshold can be configured without code.)
14. **SLA hours.** What is the maximum time per step, and do weekends and holidays count? (Default: 24–48 wall-clock hours.)
15. **Signature requirement.** May a user approve before his signature image is uploaded? (Default: no.)
16. **Vehicle change.** Is the Shipping Officer the only approver, or also the Campaign Supervisor?
17. **Two drivers on one vehicle.** Can a vehicle have two current drivers (shifts)? (Default: allowed; a driver has one vehicle at a time.)

## Drivers and Telegram

18. **Expense date.** Should the driver enter the date of each receipt, or is the submission date enough? (Default: submission date.)
19. **Odometer.** What is an unrealistic jump between two requests? (Default: 3000 km.) Should a lower reading block the request or only warn? (Default: warn.)
20. **Stopped vehicle.** Block the request (default) or allow it with a warning? What about "Under maintenance"? (Default: allowed, since maintenance receipts are expected.)
21. **Draft expiry.** How long may an unfinished request stay open? (Default: 24 hours, reminder after 6.)
22. **Limits.** Is there a maximum amount per expense type or per request beyond which a warning is shown?
23. **Driver signature.** Will a scanned signature be collected for every driver? Without one the sheet shows the driver's name only.
24. **Drivers without Telegram.** Should a supervisor be able to submit on a driver's behalf from the web?
25. **Diesel price range.** Expected minimum and maximum price per liter for the warning?

## Operations

26. **Hosting.** On-premise server or cloud VM? This decides polling vs webhook for the bot and the backup target.
27. **Telegram bot.** Who creates the bot with BotFather and owns the token?
28. **Retention.** How long must images and PDFs be kept, and may superseded images ever be purged?
29. **Approver notifications.** In-app only, or also Telegram/email for approvers?
30. **Company identity.** Logo file, official company name (Arabic/English) and any fixed footer text for the expense sheet.
31. **Report access.** Who may export images (auditors, accountants only)?
32. **Languages.** Is English needed for any user now, or is Arabic enough for go-live?

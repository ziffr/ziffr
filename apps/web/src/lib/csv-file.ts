// The CSV files Ziffr hands a person to open in a spreadsheet, such as a download of values (GLOSSARY: Observation) or of
// the Audit Log. Pure: routes and client components use it.

/** The UTF-8 byte-order mark every such file starts with: without it Excel reads the file in an older encoding and shows
 * umlauts and other letters wrongly. Spreadsheets and Ziffr's own readers drop it. */
export const CSV_BYTE_ORDER_MARK = "﻿";

/** A CSV text as the file a person is handed. */
export const csvFile = (csv: string): string => CSV_BYTE_ORDER_MARK + csv;

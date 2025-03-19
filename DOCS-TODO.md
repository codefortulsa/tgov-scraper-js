Documentation notes:

- Document the use of reserved "Db" and "Dto" prefixes for types generated directly from database (this avoids redundant type definitions by making the canonical type definition easy to identify). DB = type compatible with database, Dto = JSON.parse(JSON.stringify(model)) idempotency

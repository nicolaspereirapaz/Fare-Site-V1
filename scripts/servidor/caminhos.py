#!/usr/bin/python3
# Troca caminhos do Windows (D:\Digital\...) pelos da VPS (/srv/fare/pedidos/...) e procura outros caminhos de Windows.
import sqlite3, sys
BS = chr(92)  # barra invertida
db = sqlite3.connect(sys.argv[1], timeout=30)
for t in ("fare_photo_orders", "fare_document_folders"):
    n = db.execute(f"UPDATE {t} SET folder = replace(replace(folder, ?, ?), ?, ?) WHERE folder LIKE ? OR folder LIKE ?",
                   ("D:" + BS + "Digital", "/srv/fare/pedidos", BS, "/", "D:" + BS + "Digital%", "/srv/fare/pedidos" + BS + "%")).rowcount
    print(t, "corrigidas:", n)
db.commit()
achados = 0
for (t,) in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    for c in [c[1] for c in db.execute(f'PRAGMA table_info("{t}")')]:
        try:
            r = db.execute(f'SELECT count(*), min(substr("{c}",1,90)) FROM "{t}" WHERE typeof("{c}")=? AND (instr("{c}", ?) OR instr("{c}", ?) OR instr("{c}", ?) OR instr("{c}", ?))',
                           ("text", "C:" + BS, "D:" + BS, "C:/FareFoto", "pedidos" + BS)).fetchone()
        except sqlite3.Error:
            continue
        if r[0]:
            achados += 1; print("  ainda com caminho Windows:", t, c, r[0], "ex:", r[1])
print("colunas com caminho Windows:", achados)

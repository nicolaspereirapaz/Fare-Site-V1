import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  assignFareCodes,
  familyKey,
  isFareCodeQuery,
  SUPPLIER_LABELS,
  supplierCodeOf,
  supplierOf,
} from "@/lib/productCodes";
import type { Product } from "@/lib/xbz";

function variant(overrides: Partial<Product>): Product {
  return {
    id: "1", sku: "X000019", compoundCode: "06520-AZU", familyCode: "06520", name: "CANECA", description: "",
    productUrl: "", imageUrl: "x.jpg", category: "Canecas, Copos e Taças", subcategory: "", primaryColor: "AZUL",
    secondaryColor: "", price: 5, formattedPrice: "", clearance: false, stockMain: 10, stockAvailable: 10,
    reliability: "", restockDate: "", ...overrides,
  };
}

const XBZ = variant({});
const SPOT = variant({ id: "spot:11110-105", sku: "11110-105", compoundCode: "11110-105", familyCode: "spot:11110", supplier: "spot" });
const ASIA_P = variant({ id: "asia:BAC003", sku: "BAC003", compoundCode: "BAC003", familyCode: "asia:BAC003P", supplier: "asia" });
const ASIA = variant({ id: "asia:BT316-AZ", sku: "BT316-AZ", compoundCode: "BT316-AZ", familyCode: "asia:BT316", supplier: "asia" });

describe("código real do fornecedor (só para a equipe)", () => {
  it("é o código do produto, sem o prefixo interno; na Asia sai o 'P' do produto-pai", () => {
    expect(supplierOf(XBZ)).toBe("xbz");
    expect(supplierCodeOf([XBZ])).toBe("06520");
    expect(supplierCodeOf([SPOT])).toBe("11110");
    expect(supplierCodeOf([ASIA_P])).toBe("BAC003");
    expect(supplierCodeOf([ASIA])).toBe("BT316");
    expect(SUPPLIER_LABELS).toEqual({ xbz: "XBZ", spot: "Spot", asia: "Asia Import" });
  });

  it("produtos de fornecedores diferentes com o mesmo código não se confundem", () => {
    expect(familyKey(XBZ)).toBe("xbz:06520");
    expect(familyKey(SPOT)).toBe("spot:11110");
    expect(familyKey(variant({ familyCode: "11110" }))).not.toBe(familyKey(SPOT));
  });
});

describe("código Fare Foto (o que o cliente cadastrado vê)", () => {
  it("letra do fornecedor + número próprio, que não dá para achar no fornecedor", () => {
    const database = new DatabaseSync(":memory:");
    const codes = assignFareCodes(database, [XBZ, SPOT, ASIA_P, ASIA, variant({ id: "2", compoundCode: "06520-VD" })]);

    expect(codes.get("xbz:06520")).toBe("X10001");
    expect(codes.get("spot:11110")).toBe("S10001");
    expect(codes.get("asia:BAC003")).toBe("A10001");
    expect(codes.get("asia:BT316")).toBe("A10002");
    expect(codes.size).toBe(4); // a 2ª cor da caneca usa o mesmo código
  });

  it("o código de um produto nunca muda; produto novo pega o próximo número", () => {
    const database = new DatabaseSync(":memory:");
    assignFareCodes(database, [XBZ, ASIA]);
    const later = assignFareCodes(database, [variant({ familyCode: "09999", compoundCode: "09999-PT" }), ASIA_P, ASIA, XBZ]);

    expect(later.get("xbz:06520")).toBe("X10001");
    expect(later.get("asia:BT316")).toBe("A10001");
    expect(later.get("xbz:09999")).toBe("X10002");
    expect(later.get("asia:BAC003")).toBe("A10002");
  });

  it("reconhece quando a busca é um código Fare Foto", () => {
    expect(isFareCodeQuery("x10001")).toBe(true);
    expect(isFareCodeQuery(" S10023 ")).toBe(true);
    expect(isFareCodeQuery("caneca")).toBe(false);
    expect(isFareCodeQuery("06520")).toBe(false);
  });
});

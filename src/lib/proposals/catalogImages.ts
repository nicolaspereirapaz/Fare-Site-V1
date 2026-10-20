import { products as localProducts } from "@/data/products";
import type { QuoteCartItem } from "@/lib/commerce";
import { publicProductId, toPublicCatalogProduct } from "@/lib/publicCatalog";
import { groupAvailableProducts, type CatalogProduct } from "@/lib/xbz";
import { specLine, tidySpecValue, xbzSpecs, type ProductSpec } from "@/lib/productSpecs";
import { supplierOf } from "@/lib/productCodes";
import { photoFromName } from "@/components/staff/photoItems";
import { PHOTO_PRODUCT_IMAGE, sizeById } from "@/components/fotos/catalog";
import { getLocalCatalog } from "@/lib/xbzCatalogService";
import type { ProductCatalogInfo } from "@/lib/backoffice/documentDetails";
import { getCatalogDatabase } from "@/lib/xbzCatalogRepository";
import { readSpotCustomizations } from "@/lib/suppliers/spotCustomizations";
import { mockupUrl } from "@/lib/backoffice/mockupFiles";
/** Foto do item nos documentos: o mockup da equipe, quando houver; senão a do catálogo. */
export async function documentImageOf(item:QuoteCartItem):Promise<string|null>{
 return item.mockup?mockupUrl(item.mockup):catalogImageOf(item);
}

/** Somente catálogo local: não consulta API de fornecedor. */
export async function catalogImageOf(item:QuoteCartItem):Promise<string|null>{
 const photo=photoFromName(item.productName);
 if(photo)return PHOTO_PRODUCT_IMAGE[sizeById(photo.sizeId).group];
 if(!item.slug.startsWith("brindes/"))return localProducts.find(product=>product.slug===item.slug)?.image??null;
 const {products}=await getLocalCatalog();
 const product=groupAvailableProducts(products).find(entry=>publicProductId(entry.internalCode)===item.slug.slice("brindes/".length));
 if(!product)return null;
 const variants=toPublicCatalogProduct(product).variants;
 return variants.find(variant=>variant.label===item.selections?.["Variação"])?.imageUrl??product.imageUrl??null;
}

/** Enriquecimento somente da consulta: não altera o snapshot comercial/personalização. */
export async function documentProductOf(item:QuoteCartItem):Promise<{imageUrl:string|null;catalogInfo:ProductCatalogInfo|null}>{
 const empty={imageUrl:null,catalogInfo:null};
 // Fora do catálogo (fotos, itens avulsos): só a imagem padrão, quando houver.
 if(!item.slug.startsWith("brindes/"))return {imageUrl:await documentImageOf(item),catalogInfo:null};
 const product=await findCatalogProduct(item.slug.slice("brindes/".length));
 if(!product)return empty;
 const variants=toPublicCatalogProduct(product).variants;
 const chosenIndex=variants.findIndex(variant=>variant.label===item.selections?.["Variação"]);
 const chosen=product.variants[chosenIndex];
 const imageUrl=item.mockup?mockupUrl(item.mockup):variants[chosenIndex]?.imageUrl??product.imageUrl??null;
 const description=(chosen?.description||product.description||'').trim();
 let printingAreas:ProductCatalogInfo['printingAreas']=[];
 const first=product.variants[0];
 if(first?.supplier==='spot'){
  const gs=item.costing?.gravacoes??(item.costing?[{tecnica:item.costing.tecnica}]:[]);
  const selected=new Set(gs.filter(g=>g.tecnica.tipo==='spot').map(g=>String(g.tecnica.opcaoId??'')));
  if(selected.size){
   const options=readSpotCustomizations(getCatalogDatabase(),first.familyCode.replace(/^spot:/,''));
   const areas=options.filter(option=>selected.has(option.id)&&option.area.trim()).map(option=>({technique:option.tecnica,location:option.local,area:option.area}));
   printingAreas=[...new Map(areas.map(area=>[JSON.stringify(area),area])).values()];
  }
 }
 const specs=await catalogSpecs(product);
 return {imageUrl,catalogInfo:description||printingAreas.length||specs.length?{description,printingAreas,specs}:null};
}

async function findCatalogProduct(publicId:string){
 const {products}=await getLocalCatalog();
 return groupAvailableProducts(products).find(entry=>publicProductId(entry.internalCode)===publicId)??null;
}

/** Medidas do produto: Spot vem no catálogo; XBZ é lida da página do produto (guardada). */
export async function catalogSpecs(product:CatalogProduct):Promise<ProductSpec[]>{
 const first=product.variants[0];
 if(!first)return [];
 const supplier=supplierOf(first);
 // Catálogo já baixado pode ter o "ø" antigo: arruma na leitura também.
 if(supplier==='spot')return (first.specs??[]).map(spec=>({...spec,value:tidySpecValue(spec.value)}));
 // A XBZ escreve "Diametro" sem acento.
 if(supplier==='xbz')return xbzSpecs(getCatalogDatabase(),first.familyCode).then(specs=>specs.map(spec=>({...spec,label:spec.label.replace(/^Diametro/,'Diâmetro')}))).catch(()=>[]);
 return [];
}

/** Descrição e medidas de um item para o documento do cliente (orçamento e pedido). */
export async function documentDetailsOf(item:QuoteCartItem):Promise<{description:string;specs:string[]}>{
 const {catalogInfo}=await documentProductOf(item);
 return {description:catalogInfo?.description??'',specs:(catalogInfo?.specs??[]).map(specLine)};
}

/** Medidas pelo id público (detalhes do produto no editor). */
export async function specsByPublicId(publicId:string):Promise<ProductSpec[]>{
 const product=await findCatalogProduct(publicId);
 return product?catalogSpecs(product):[];
}

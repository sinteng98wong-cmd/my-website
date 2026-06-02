declare module "pdfmake" {
  class PdfPrinter {
    constructor(fonts: Record<string, any>);
    createPdfKitDocument(docDefinition: any, options?: any): any;
  }
  export = PdfPrinter;
}

declare module "pdfmake/interfaces" {
  export interface TDocumentDefinitions {
    content:       any;
    defaultStyle?: any;
    styles?:       any;
    pageSize?:     string;
    pageMargins?:  number | number[];
    header?:       any;
    footer?:       any;
    [key: string]: any;
  }
}

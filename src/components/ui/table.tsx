import * as React from "react";
import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("w-full", className)} {...props} />
));
Table.displayName = "Table";

const TableCaption = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <caption className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
);
TableCaption.displayName = "TableCaption";

const TableHeader = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <thead className={cn("", className)} {...props} />
);
TableHeader.displayName = "TableHeader";

const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <tbody className={cn("", className)} {...props} />
);
TableBody.displayName = "TableBody";

const TableFooter = ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
  <tfoot className={cn("", className)} {...props} />
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn("border-b border-border", className)} {...props} />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableHeaderCellElement, React.HTMLAttributes<HTMLTableHeaderCellElement>>(({ className, ...props }, ref) => (
  <th ref={ref} className={cn("border-b border-border bg-muted text-muted-foreground text-left text-xs font-semibold p-4", className)} {...props} />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableDataCellElement, React.HTMLAttributes<HTMLTableDataCellElement>>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("p-4 align-middle", className)} {...props} />
));
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption };

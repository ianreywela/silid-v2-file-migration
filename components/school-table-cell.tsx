import { TableCell, TableHead } from "@/components/ui/table";

export const SCHOOL_COLUMN_CLASS = "w-[220px] max-w-[220px]";

type SchoolTableHeadProps = {
  className?: string;
};

export function SchoolTableHead({ className }: SchoolTableHeadProps) {
  return (
    <TableHead className={className ?? SCHOOL_COLUMN_CLASS}>School</TableHead>
  );
}

type SchoolTableCellProps = {
  schoolCode: string;
  schoolName: string;
};

export function SchoolTableCell({ schoolCode, schoolName }: SchoolTableCellProps) {
  return (
    <TableCell className={`${SCHOOL_COLUMN_CLASS} whitespace-normal`}>
      <div className="min-w-0">
        <p className="truncate font-medium" title={schoolCode}>
          {schoolCode}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={schoolName}>
          {schoolName}
        </p>
      </div>
    </TableCell>
  );
}

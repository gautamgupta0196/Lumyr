#!/usr/bin/env python3
"""
File Schema Inference Script
Infers schema from CSV, Excel, and PDF files for Lumyr.

Usage:
    python file_schema.py <file_path> [--preview <limit>]

Output (JSON):
    {
        "columns": [
            {"name": "col1", "type": "STRING", "originalType": "object", "nullable": true},
            ...
        ],
        "rowCount": 1000,
        "preview": [{"col1": "value1", ...}, ...]
    }

For PDFs, returns extracted text and any detected tables.
"""

import sys
import json
import argparse
import pandas as pd
import numpy as np
from pathlib import Path


def map_dtype_to_type(dtype: str) -> str:
    """Map pandas dtype to normalized type."""
    dtype_lower = str(dtype).lower()

    # Integer types
    if 'int' in dtype_lower:
        return 'INTEGER'

    # Float types
    if 'float' in dtype_lower or dtype_lower == 'decimal':
        return 'FLOAT'

    # Boolean
    if 'bool' in dtype_lower:
        return 'BOOLEAN'

    # Datetime types
    if 'datetime' in dtype_lower:
        return 'TIMESTAMP'

    if 'timedelta' in dtype_lower:
        return 'TIME'

    # Date (pandas doesn't have a pure date type, uses datetime)

    # String/object types
    if dtype_lower == 'object' or 'str' in dtype_lower:
        return 'STRING'

    # Category
    if dtype_lower == 'category':
        return 'STRING'

    return 'UNKNOWN'


def serialize_value(val):
    """Convert a value to JSON-serializable format."""
    if pd.isna(val):
        return None
    if isinstance(val, (np.integer, np.int64, np.int32)):
        return int(val)
    if isinstance(val, (np.floating, np.float64, np.float32)):
        if np.isnan(val) or np.isinf(val):
            return None
        return float(val)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if isinstance(val, (pd.Timestamp, np.datetime64)):
        return str(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    return str(val)


def excel_to_csv(file_path: str, nrows: int = 10000) -> dict:
    """
    Convert all sheets in an Excel file to CSV text.

    Returns:
        Dictionary with sheets list, each containing name, csv text, and rowCount.
    """
    path = Path(file_path)
    ext = path.suffix.lower()
    engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
    xls = pd.ExcelFile(file_path, engine=engine)

    sheets = []
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name, nrows=nrows)
        csv_text = df.to_csv(index=False)
        sheets.append({
            'name': sheet_name,
            'csv': csv_text,
            'rowCount': len(df)
        })

    return {'sheets': sheets}


def infer_pdf_schema(file_path: str, preview_limit: int = 5) -> dict:
    """
    Extract text and tables from a PDF file.

    Returns:
        Dictionary with text content, extracted tables, and metadata
    """
    try:
        import pdfplumber
    except ImportError:
        raise ValueError("PDF support requires pdfplumber. Install with: pip install pdfplumber")

    text_content = []
    tables = []
    page_count = 0

    with pdfplumber.open(file_path) as pdf:
        page_count = len(pdf.pages)

        for i, page in enumerate(pdf.pages[:20]):  # Limit to first 20 pages
            # Extract text
            page_text = page.extract_text()
            if page_text:
                text_content.append(f"--- Page {i + 1} ---\n{page_text}")

            # Extract tables
            page_tables = page.extract_tables()
            for j, table in enumerate(page_tables):
                if table and len(table) > 1:  # Has header + at least one row
                    # Convert to DataFrame for consistent handling
                    headers = [str(h or f'col_{k}') for k, h in enumerate(table[0])]
                    rows = table[1:]
                    df = pd.DataFrame(rows, columns=headers)
                    tables.append({
                        'page': i + 1,
                        'index': j,
                        'columns': headers,
                        'rowCount': len(rows),
                        'preview': df.head(preview_limit).to_dict(orient='records')
                    })

    # For PDF, we return a special schema format
    # Columns represent metadata about the PDF content
    columns = [
        {'name': 'text_content', 'type': 'STRING', 'originalType': 'text', 'nullable': False},
        {'name': 'page_count', 'type': 'INTEGER', 'originalType': 'int', 'nullable': False},
        {'name': 'table_count', 'type': 'INTEGER', 'originalType': 'int', 'nullable': False},
    ]

    # Preview shows text excerpt
    full_text = '\n\n'.join(text_content)
    preview_text = full_text[:2000] + ('...' if len(full_text) > 2000 else '')

    return {
        'columns': columns,
        'rowCount': page_count,
        'preview': [{
            'text_content': preview_text,
            'page_count': page_count,
            'table_count': len(tables)
        }],
        'isPdf': True,
        'textContent': full_text[:50000],  # Limit to 50k chars for context
        'tables': tables
    }


def infer_schema(file_path: str, preview_limit: int = 5) -> dict:
    """
    Infer schema from a CSV or Excel file.

    Args:
        file_path: Path to the file
        preview_limit: Number of rows to include in preview

    Returns:
        Dictionary with columns, rowCount, and preview
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = path.suffix.lower()

    # Handle PDF files separately
    if ext == '.pdf':
        return infer_pdf_schema(file_path, preview_limit)

    # Read file based on extension
    try:
        if ext == '.csv':
            # Try to detect encoding and delimiter
            df = pd.read_csv(
                file_path,
                nrows=10000,  # Read up to 10k rows for schema inference
                low_memory=False,
                on_bad_lines='skip'
            )
        elif ext in ['.xlsx', '.xls']:
            # Read ALL sheets from Excel files
            engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
            xls = pd.ExcelFile(file_path, engine=engine)
            sheet_names = xls.sheet_names

            if len(sheet_names) > 1:
                # Multi-sheet Excel: return data for each sheet
                sheets = []
                for sheet_name in sheet_names:
                    sheet_df = pd.read_excel(xls, sheet_name=sheet_name, nrows=10000)
                    sheet_columns = []
                    for col in sheet_df.columns:
                        dtype = sheet_df[col].dtype
                        nullable = sheet_df[col].isna().any()
                        sheet_columns.append({
                            'name': str(col),
                            'type': map_dtype_to_type(dtype),
                            'originalType': str(dtype),
                            'nullable': bool(nullable)
                        })

                    sheet_preview = []
                    for _, row in sheet_df.head(preview_limit).iterrows():
                        row_dict = {}
                        for col in sheet_df.columns:
                            row_dict[str(col)] = serialize_value(row[col])
                        sheet_preview.append(row_dict)

                    sheets.append({
                        'name': sheet_name,
                        'columns': sheet_columns,
                        'rowCount': len(sheet_df),
                        'preview': sheet_preview
                    })

                return {
                    'columns': sheets[0]['columns'] if sheets else [],
                    'rowCount': sum(s['rowCount'] for s in sheets),
                    'preview': sheets[0]['preview'] if sheets else [],
                    'sheets': sheets,
                    'sheetNames': sheet_names
                }
            else:
                df = pd.read_excel(xls, sheet_name=sheet_names[0], nrows=10000)
        else:
            raise ValueError(f"Unsupported file format: {ext}")
    except Exception as e:
        raise ValueError(f"Failed to read file: {str(e)}")

    # Get full row count for CSV (more efficient than reading entire file)
    if ext == '.csv':
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                row_count = sum(1 for _ in f) - 1  # Subtract header
        except:
            row_count = len(df)
    else:
        row_count = len(df)

    # Infer column types
    columns = []
    for col in df.columns:
        dtype = df[col].dtype
        nullable = df[col].isna().any()

        columns.append({
            'name': str(col),
            'type': map_dtype_to_type(dtype),
            'originalType': str(dtype),
            'nullable': bool(nullable)
        })

    # Get preview rows
    preview_df = df.head(preview_limit)
    preview = []

    for _, row in preview_df.iterrows():
        row_dict = {}
        for col in df.columns:
            row_dict[str(col)] = serialize_value(row[col])
        preview.append(row_dict)

    return {
        'columns': columns,
        'rowCount': row_count,
        'preview': preview
    }


def main():
    parser = argparse.ArgumentParser(description='Infer schema from CSV/Excel files')
    parser.add_argument('file_path', help='Path to the file')
    parser.add_argument('--preview', type=int, default=5, help='Number of preview rows')
    parser.add_argument('--as-csv', action='store_true', help='Convert Excel file to CSV text (all sheets)')

    args = parser.parse_args()

    try:
        if args.as_csv:
            result = excel_to_csv(args.file_path)
        else:
            result = infer_schema(args.file_path, args.preview)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            'error': str(e)
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()

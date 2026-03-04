"""
Markdown Handler - Structure-preserving translation.

Approach:
1. Parse markdown into AST (Abstract Syntax Tree)
2. Extract only translatable text nodes
3. Send text-only to Gemini (no formatting)
4. Replace text in AST with translations
5. Render back to markdown

This GUARANTEES structure preservation - Gemini never sees formatting!
"""

import re
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass, field
from enum import Enum


class NodeType(str, Enum):
    """Types of markdown nodes."""
    HEADER = "header"
    PARAGRAPH = "paragraph"
    LIST_ITEM = "list_item"
    TABLE_CELL = "table_cell"
    CODE_BLOCK = "code_block"      # Don't translate
    CODE_INLINE = "code_inline"    # Don't translate
    LINK_TEXT = "link_text"
    IMAGE_ALT = "image_alt"
    BLOCKQUOTE = "blockquote"
    TEXT = "text"
    FORMATTING = "formatting"      # Bold, italic wrappers
    SEPARATOR = "separator"        # ---, ===
    EMPTY = "empty"


@dataclass
class TextNode:
    """A translatable text segment."""
    id: int
    text: str
    node_type: NodeType
    prefix: str = ""      # Formatting before text (e.g., "## ", "- ", "| ")
    suffix: str = ""      # Formatting after text (e.g., " |")
    translatable: bool = True
    
    def __str__(self):
        return f"{self.prefix}{self.text}{self.suffix}"


@dataclass
class MarkdownAST:
    """Abstract Syntax Tree for markdown document."""
    nodes: List[TextNode] = field(default_factory=list)
    raw_lines: List[str] = field(default_factory=list)
    
    def get_translatable_texts(self) -> List[Tuple[int, str]]:
        """Get list of (id, text) for translatable nodes."""
        return [
            (node.id, node.text) 
            for node in self.nodes 
            if node.translatable and node.text.strip()
        ]
    
    def set_translation(self, node_id: int, translated: str):
        """Set translation for a specific node."""
        for node in self.nodes:
            if node.id == node_id:
                node.text = translated
                break
    
    def render(self) -> str:
        """Render AST back to markdown."""
        return "".join(str(node) for node in self.nodes)


class MarkdownHandler:
    """
    Parse and reconstruct markdown while preserving structure.
    
    Key insight: We treat markdown as a sequence of:
    - Formatting markers (prefixes/suffixes)
    - Translatable text content
    
    Only the text content gets sent to Gemini.
    """
    
    # Patterns for non-translatable content
    CODE_BLOCK_PATTERN = re.compile(r'^```.*$', re.MULTILINE)
    CODE_INLINE_PATTERN = re.compile(r'`[^`]+`')
    STANDARD_CODE_PATTERN = re.compile(r'\b(EN|ISO|IEC|DIN|ASTM|GB|JIS)\s*\d+[-\d.:]*\b')
    FORMULA_PATTERN = re.compile(r'\$[^$]+\$|\$\$[^$]+\$\$')
    URL_PATTERN = re.compile(r'https?://[^\s\)]+')
    
    def __init__(self):
        self.node_id = 0
    
    def _next_id(self) -> int:
        self.node_id += 1
        return self.node_id
    
    def parse(self, markdown: str) -> MarkdownAST:
        """
        Parse markdown into AST.
        
        Strategy: Process line by line, identifying structure markers.
        """
        self.node_id = 0
        ast = MarkdownAST()
        ast.raw_lines = markdown.split('\n')
        
        lines = markdown.split('\n')
        in_code_block = False
        code_block_content = []
        code_block_prefix = ""
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Handle code blocks (don't translate)
            if line.startswith('```'):
                if not in_code_block:
                    in_code_block = True
                    code_block_prefix = line + '\n'
                    code_block_content = []
                else:
                    # End of code block
                    full_code = code_block_prefix + '\n'.join(code_block_content) + '\n' + line
                    ast.nodes.append(TextNode(
                        id=self._next_id(),
                        text='\n'.join(code_block_content),
                        node_type=NodeType.CODE_BLOCK,
                        prefix=code_block_prefix,
                        suffix='\n' + line + '\n',
                        translatable=False
                    ))
                    in_code_block = False
                i += 1
                continue
            
            if in_code_block:
                code_block_content.append(line)
                i += 1
                continue
            
            # Empty line
            if not line.strip():
                ast.nodes.append(TextNode(
                    id=self._next_id(),
                    text="",
                    node_type=NodeType.EMPTY,
                    prefix="\n",
                    translatable=False
                ))
                i += 1
                continue
            
            # Headers (# ## ### etc.)
            header_match = re.match(r'^(#{1,6})\s+(.+)$', line)
            if header_match:
                prefix = header_match.group(1) + ' '
                text = header_match.group(2)
                ast.nodes.append(TextNode(
                    id=self._next_id(),
                    text=text,
                    node_type=NodeType.HEADER,
                    prefix=prefix,
                    suffix='\n',
                    translatable=True
                ))
                i += 1
                continue
            
            # Horizontal rules
            if re.match(r'^[-*_]{3,}\s*$', line):
                ast.nodes.append(TextNode(
                    id=self._next_id(),
                    text=line,
                    node_type=NodeType.SEPARATOR,
                    suffix='\n',
                    translatable=False
                ))
                i += 1
                continue
            
            # Table rows
            if '|' in line and re.match(r'^\s*\|', line):
                self._parse_table_row(ast, line)
                i += 1
                continue
            
            # List items
            list_match = re.match(r'^(\s*)([-*+]|\d+\.)\s+(.*)$', line)
            if list_match:
                indent = list_match.group(1)
                marker = list_match.group(2)
                text = list_match.group(3)
                ast.nodes.append(TextNode(
                    id=self._next_id(),
                    text=text,
                    node_type=NodeType.LIST_ITEM,
                    prefix=f"{indent}{marker} ",
                    suffix='\n',
                    translatable=True
                ))
                i += 1
                continue
            
            # Blockquote
            if line.startswith('>'):
                quote_match = re.match(r'^(>\s*)(.*)$', line)
                if quote_match:
                    ast.nodes.append(TextNode(
                        id=self._next_id(),
                        text=quote_match.group(2),
                        node_type=NodeType.BLOCKQUOTE,
                        prefix=quote_match.group(1),
                        suffix='\n',
                        translatable=True
                    ))
                i += 1
                continue
            
            # Regular paragraph
            ast.nodes.append(TextNode(
                id=self._next_id(),
                text=line,
                node_type=NodeType.PARAGRAPH,
                suffix='\n',
                translatable=True
            ))
            i += 1
        
        return ast
    
    def _parse_table_row(self, ast: MarkdownAST, line: str):
        """Parse a table row, preserving cell structure."""
        # Check if it's a separator row (|---|---|)
        if re.match(r'^\s*\|[\s:-]+\|[\s:-|]*$', line):
            ast.nodes.append(TextNode(
                id=self._next_id(),
                text=line,
                node_type=NodeType.SEPARATOR,
                suffix='\n',
                translatable=False
            ))
            return
        
        # Split by | but preserve structure
        cells = line.split('|')
        
        # First empty cell (before first |)
        if cells[0].strip() == '':
            ast.nodes.append(TextNode(
                id=self._next_id(),
                text="",
                node_type=NodeType.TABLE_CELL,
                prefix="|",
                translatable=False
            ))
            cells = cells[1:]
        
        # Process each cell
        for i, cell in enumerate(cells):
            is_last = (i == len(cells) - 1)
            cell_text = cell.strip()
            
            # Calculate padding
            leading_space = len(cell) - len(cell.lstrip())
            trailing_space = len(cell) - len(cell.rstrip())
            
            if is_last and cell_text == '':
                # Trailing empty cell
                ast.nodes.append(TextNode(
                    id=self._next_id(),
                    text="",
                    node_type=NodeType.TABLE_CELL,
                    suffix='\n',
                    translatable=False
                ))
            else:
                ast.nodes.append(TextNode(
                    id=self._next_id(),
                    text=cell_text,
                    node_type=NodeType.TABLE_CELL,
                    prefix=' ' * leading_space,
                    suffix=' ' * trailing_space + ('|' if not is_last else '|\n'),
                    translatable=bool(cell_text)
                ))
    
    def extract_translatable(self, ast: MarkdownAST) -> List[Dict]:
        """
        Extract translatable text segments.
        
        Returns list of {id, text, type} for translation.
        """
        segments = []
        for node in ast.nodes:
            if node.translatable and node.text.strip():
                # Further process to protect inline elements
                processed_text, protected = self._protect_inline_elements(node.text)
                segments.append({
                    'id': node.id,
                    'text': processed_text,
                    'type': node.node_type.value,
                    'protected': protected
                })
        return segments
    
    def _protect_inline_elements(self, text: str) -> Tuple[str, Dict[str, str]]:
        """
        Replace inline code, URLs, standards codes with placeholders.
        
        Returns: (processed_text, {placeholder: original})
        """
        protected = {}
        result = text
        
        # Protect inline code
        for i, match in enumerate(self.CODE_INLINE_PATTERN.finditer(text)):
            placeholder = f"__CODE_{i}__"
            protected[placeholder] = match.group()
            result = result.replace(match.group(), placeholder, 1)
        
        # Protect standards codes (EN 13001, ISO 9001, etc.)
        for i, match in enumerate(self.STANDARD_CODE_PATTERN.finditer(result)):
            placeholder = f"__STD_{i}__"
            if placeholder not in protected:
                protected[placeholder] = match.group()
                result = result.replace(match.group(), placeholder, 1)
        
        # Protect formulas
        for i, match in enumerate(self.FORMULA_PATTERN.finditer(result)):
            placeholder = f"__FORMULA_{i}__"
            if placeholder not in protected:
                protected[placeholder] = match.group()
                result = result.replace(match.group(), placeholder, 1)
        
        # Protect URLs
        for i, match in enumerate(self.URL_PATTERN.finditer(result)):
            placeholder = f"__URL_{i}__"
            if placeholder not in protected:
                protected[placeholder] = match.group()
                result = result.replace(match.group(), placeholder, 1)
        
        return result, protected
    
    def restore_protected(self, text: str, protected: Dict[str, str]) -> str:
        """Restore protected elements in translated text."""
        result = text
        for placeholder, original in protected.items():
            result = result.replace(placeholder, original)
        return result
    
    def apply_translations(
        self,
        ast: MarkdownAST,
        translations: Dict[int, str],
        protected_map: Dict[int, Dict[str, str]]
    ):
        """
        Apply translations back to AST.
        
        Args:
            ast: The parsed AST
            translations: {node_id: translated_text}
            protected_map: {node_id: {placeholder: original}}
        """
        for node in ast.nodes:
            if node.id in translations:
                translated = translations[node.id]
                # Restore protected elements
                if node.id in protected_map:
                    translated = self.restore_protected(translated, protected_map[node.id])
                node.text = translated


# Convenience functions

def parse_markdown(markdown: str) -> MarkdownAST:
    """Parse markdown into AST."""
    handler = MarkdownHandler()
    return handler.parse(markdown)


def extract_for_translation(markdown: str) -> Tuple[MarkdownAST, List[Dict], Dict[int, Dict]]:
    """
    Extract translatable content from markdown.
    
    Returns:
        - ast: Parsed AST
        - segments: List of {id, text, type} to translate
        - protected_map: Map of node_id -> protected elements
    """
    handler = MarkdownHandler()
    ast = handler.parse(markdown)
    
    segments = []
    protected_map = {}
    
    for node in ast.nodes:
        if node.translatable and node.text.strip():
            processed, protected = handler._protect_inline_elements(node.text)
            segments.append({
                'id': node.id,
                'text': processed,
                'type': node.node_type.value
            })
            if protected:
                protected_map[node.id] = protected
    
    return ast, segments, protected_map


def apply_and_render(
    ast: MarkdownAST,
    translations: Dict[int, str],
    protected_map: Dict[int, Dict[str, str]]
) -> str:
    """
    Apply translations and render back to markdown.
    
    Args:
        ast: Parsed AST
        translations: {node_id: translated_text}
        protected_map: {node_id: {placeholder: original}}
    
    Returns:
        Translated markdown with preserved structure
    """
    handler = MarkdownHandler()
    handler.apply_translations(ast, translations, protected_map)
    return ast.render()

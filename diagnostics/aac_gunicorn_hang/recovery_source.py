"""Deterministic recovery backport: identical reviewed deletion functions."""
import ast

def assemble(baseline: bytes, candidate: bytes) -> bytes:
    old=baseline.decode('utf-8'); new=candidate.decode('utf-8')
    old_nodes={n.name:n for n in ast.parse(old).body if isinstance(n,ast.FunctionDef)}
    new_nodes={n.name:n for n in ast.parse(new).body if isinstance(n,ast.FunctionDef)}
    lines=old.splitlines(keepends=True); candidate_lines=new.splitlines(keepends=True)
    names=['_delete_class_dependencies','delete_student']
    for name in sorted(names,key=lambda n:old_nodes[n].lineno,reverse=True):
        node=old_nodes[name]; replacement=new_nodes[name]
        lines[node.lineno-1:node.end_lineno]=candidate_lines[replacement.lineno-1:replacement.end_lineno]
    result=''.join(lines)+'\nfrom aac_recovery_guard import RecoveryGuard\napp.add_middleware(RecoveryGuard)\n'
    actual={n.name:ast.dump(n,include_attributes=False) for n in ast.parse(result).body if isinstance(n,ast.FunctionDef)}
    for name in old_nodes:
        expected=new_nodes[name] if name in names else old_nodes[name]
        assert actual[name]==ast.dump(expected,include_attributes=False), name
    return result.encode('utf-8')

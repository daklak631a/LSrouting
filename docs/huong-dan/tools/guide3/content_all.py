"""Ghép các phần nội dung thành một Guide đã gán số hình và thay tham chiếu {hinh:...}."""
import content_1
import content_2
import content_3
import content_4
from model import Guide, resolve_refs


def build_guide():
    g = Guide()
    for part in (content_1, content_2, content_3, content_4):
        part.build(g)
    resolve_refs(g)
    return g


if __name__ == '__main__':
    guide = build_guide()
    print('%d khối, %d hình' % (len(guide.blocks), guide.figure_no))
    unused = [n for n in guide.manifest if n not in set(guide.used)]
    print('chưa dùng:', unused)

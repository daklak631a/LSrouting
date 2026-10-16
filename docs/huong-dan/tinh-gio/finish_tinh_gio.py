"""Mở tài liệu bằng Word, cập nhật mục lục và các trường số trang rồi lưu lại.

    py docs/huong-dan/tinh-gio/finish_tinh_gio.py
"""
import os
import pythoncom
import win32com.client as wc

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.normpath(os.path.join(HERE, '..', 'CACH_TINH_GIO_LS_ROUTING.docx'))

pythoncom.CoInitialize()
word = wc.DispatchEx('Word.Application')
word.Visible = False
word.DisplayAlerts = 0
try:
    doc = word.Documents.Open(PATH)
    # Word dựng lại hai kiểu mục lục mặc định khi cập nhật, nên chỉnh khoảng cách ở đây để hai cấp vừa một trang.
    for style_id, size, before, bold, indent in ((-20, 11, 5, True, 0), (-21, 10, 0, False, 12)):
        st = doc.Styles(style_id)
        st.Font.Size, st.Font.Bold = size, bold
        st.ParagraphFormat.SpaceBefore, st.ParagraphFormat.SpaceAfter = before, 0
        st.ParagraphFormat.LeftIndent = indent
        st.ParagraphFormat.LineSpacingRule = 0
    doc.Repaginate()
    if doc.TablesOfContents.Count:
        doc.TablesOfContents(1).Update()
    doc.Fields.Update()
    if doc.TablesOfContents.Count:
        doc.TablesOfContents(1).Update()
    pages = doc.ComputeStatistics(2)
    doc.Save()
    doc.Close(False)
    print('pages', pages)
finally:
    word.Quit()

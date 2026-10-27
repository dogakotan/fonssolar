-- Projeler menüde Genel Bakış gibi bölümsüz (üst seviye) gösterilir; "Proje › Projeler" tekrarı kalkar.
-- Admin ve proje yöneticisinde Proje bölümünde başka öğe olmadığından bu rollerde Proje başlığı çizilmez.
set local lock_timeout = '3s';
update public.role_sidebar_items set section_key = null where item_key = 'projeler' and section_key = 'proje';

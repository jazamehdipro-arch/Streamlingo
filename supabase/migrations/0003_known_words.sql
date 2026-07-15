-- "Je connais ce mot" : un mot marqué connu ne réapparaît plus dans
-- l'overlay (filtré côté serveur à l'analyse des segments) ni dans la file
-- de révision. Il reste dans la banque pour l'historique.
alter table vocab_items add column known boolean not null default false;
create index vocab_items_known_idx on vocab_items(user_id, known);

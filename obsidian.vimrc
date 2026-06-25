" Obsidian Vim alignment with ~/.config/nvim.
" Keep editor-native behavior here; Spacekeys owns <Space> leader commands.

" Clipboard integration via Vimrc Support.
set clipboard=unnamed

" Exit insert mode with the same muscle memory as nvim.
imap jk <Esc>

" Match nvim's line navigation preferences.
nmap H ^
nmap L $
nmap J 3j
nmap K 3k
vmap J 3j
vmap K 3k

" Preserve the yank buffer for visual deletes/changes. Keep normal d/c native:
" CodeMirror Vim breaks operator repeats like dd when bare operators are remapped.
vmap d "_d
vmap c "_c

" Preserve yank buffer when replacing visual selections where supported.
vmap p P
vmap P p

" Move lines/blocks with Alt+j/k, matching nvim as closely as Obsidian allows.
exmap swaplinedown obcommand editor:swap-line-down
exmap swaplineup obcommand editor:swap-line-up
nmap <A-j> :swaplinedown<CR>
nmap <A-k> :swaplineup<CR>
vmap <A-j> :swaplinedown<CR>
vmap <A-k> :swaplineup<CR>

" History navigation. Clear Obsidian defaults for these if they conflict.
exmap back obcommand app:go-back
exmap forward obcommand app:go-forward
nmap <C-o> :back<CR>
nmap <C-i> :forward<CR>

" Common fold/tab commands via Obsidian.
exmap togglefold obcommand editor:toggle-fold
exmap foldall obcommand editor:fold-all
exmap unfoldall obcommand editor:unfold-all
exmap tabnext obcommand workspace:next-tab
exmap tabprev obcommand workspace:previous-tab
nmap zo :togglefold<CR>
nmap zc :togglefold<CR>
nmap za :togglefold<CR>
nmap zM :foldall<CR>
nmap zR :unfoldall<CR>
nmap gt :tabnext<CR>
nmap gT :tabprev<CR>

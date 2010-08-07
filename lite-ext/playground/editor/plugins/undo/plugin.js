/**
 * undo,redo manager for kissy editor
 * @author:yiminghe@gmail.com
 */
KISSYEDITOR.add("editor-plugin-undo", function(KE) {
    var S = KISSY,
        arrayCompare = KE.Utils.arrayCompare,
        UA = S.UA,
        Event = S.Event;

    /**
     * ��ǰ�༭����״̬������html��ѡ������
     * @param editor
     */
    function Snapshot(editor) {
        var contents = editor.getData(),selection = contents && editor.getSelection();
        //����html
        this.contents = contents;
        //ѡ��������ǩ��־
        this.bookmarks = selection && selection.createBookmarks2(true);
    }


    S.augment(Snapshot, {
        /**
         * �༭״̬���Ƿ����
         * @param otherImage
         */
        equals:function(otherImage) {
            var thisContents = this.contents,
                otherContents = otherImage.contents;
            if (thisContents != otherContents)
                return false;
            var bookmarksA = this.bookmarks,
                bookmarksB = otherImage.bookmarks;

            if (bookmarksA || bookmarksB) {
                if (!bookmarksA || !bookmarksB || bookmarksA.length != bookmarksB.length)
                    return false;

                for (var i = 0; i < bookmarksA.length; i++) {
                    var bookmarkA = bookmarksA[ i ],
                        bookmarkB = bookmarksB[ i ];

                    if (
                        bookmarkA.startOffset != bookmarkB.startOffset ||
                            bookmarkA.endOffset != bookmarkB.endOffset ||
                            !arrayCompare(bookmarkA.start, bookmarkB.start) ||
                            !arrayCompare(bookmarkA.end, bookmarkB.end)) {
                        return false;
                    }
                }
            }

            return true;
        }
    });


    /**
     * �����������ӳٴ���
     * @param s
     * @param fn
     * @param scope
     */
    function BufferTimer(s, fn, scope) {
        this.s = s;
        this.fn = fn;
        this.scope = scope || window;
        this.bufferTimer = null;
    }

    S.augment(BufferTimer, {
        run:function() {
            if (this.bufferTimer) {
                clearTimeout(this.bufferTimer);
                this.bufferTimer = null;
            }
            var self = this;

            this.bufferTimer = setTimeout(function() {
                self.fn.call(self.scope);
            }, this.s);
        }
    });
    var LIMIT = 30;


    /**
     * ͨ���༭����save��restore�¼����༭��ʵ������ʷջ����������̼��
     * @param editor
     */
    function UndoManager(editor) {
        //redo undo history stack
        /**
         * �༭��״̬��ʷ����
         */
        this.history = [];
        this.index = 0;
        this.editor = editor;
        this.bufferTimer = new BufferTimer(500, this.save, this);
        this._init();
    }

    var editingKeyCodes = { /*Backspace*/ 8:1, /*Delete*/ 46:1 },
        modifierKeyCodes = { /*Shift*/ 16:1, /*Ctrl*/ 17:1, /*Alt*/ 18:1 },
        navigationKeyCodes = { 37:1, 38:1, 39:1, 40:1 },// Arrows: L, T, R, B
        zKeyCode = 90,
        yKeyCode = 89;


    S.augment(UndoManager, {
        /**
         * ��ؼ������룬buffer����
         * @param ev
         */
        _keyMonitor:function(ev) {
            var self = this,editor = self.editor,doc = editor.document;
            Event.on(doc, "keydown", function(ev) {
                var keycode = ev.keyCode;
                if (keycode in navigationKeyCodes
                    || keycode in modifierKeyCodes
                    )
                    return;
                //ctrl+z������
                if (keycode === zKeyCode && (ev.ctrlKey || ev.metaKey)) {
                    editor.fire("restore", {d:-1});
                    ev.halt();
                    return;
                }
                //ctrl+y������
                if (keycode === yKeyCode && (ev.ctrlKey || ev.metaKey)) {
                    editor.fire("restore", {d:1});
                    ev.halt();
                    return;
                }
                editor.fire("save", {buffer:1});
            });
        },

        _init:function() {
            var self = this,editor = self.editor;
            //�ⲿͨ��editor����save|restore,�����������¼�����
            editor.on("save", function(ev) {
                if (ev.buffer)
                //���̲�����Ҫ����
                    self.bufferTimer.run();
                else {
                    //��������save
                    self.save();
                }
            });
            editor.on("restore", this.restore, this);
            self._keyMonitor();
            //��saveһ��
            self.save();
        },

        /**
         * ������ʷ
         */
        save:function() {
            //ǰ�����ʷ����
            if (this.history.length > this.index + 1)
                this.history.splice(this.index + 1, this.history.length - this.index - 1);

            var self = this,
                editor = self.editor,
                last = self.history.length > 0 ? self.history[self.history.length - 1] : null,
                current = new Snapshot(self.editor);

            if (!last || !last.equals(current)) {
                if (self.history.length === LIMIT) {
                    self.history.shift();
                }
                self.history.push(current);
                this.index = self.history.length - 1;
                editor.fire("afterSave", {history:self.history,index:this.index});
            }
        },

        /**
         *
         * @param ev
         * ev.d ��1.��ǰ���� ��-1.�������
         */
        restore:function(ev) {
            var d = ev.d,self = this,editor = self.editor,
                snapshot = self.history.length > 0 ? self.history[this.index + d] : null;
            if (snapshot) {
                editor.setData(snapshot.contents);
                if (snapshot.bookmarks)
                    self.editor.getSelection().selectBookmarks(snapshot.bookmarks);
                else if (UA.ie) {
                    // IE BUG: If I don't set the selection to *somewhere* after setting
                    // document contents, then IE would create an empty paragraph at the bottom
                    // the next time the document is modified.
                    var $range = this.editor.document.body.createTextRange();
                    $range.collapse(true);
                    $range.select();
                }
                this.index += d;
                editor.fire("afterRestore", {
                    history:self.history,
                    index:this.index
                });
            }
        }
    });


    var TripleButton = KE.TripleButton,RedoMap = {
        "redo":1,
        "undo":-1
    };

    /**
     * �����������볷����ui����
     * @param editor
     * @param text
     */
    function RestoreUI(editor, text, title) {
        var self = this;
        this.editor = editor;
        self.title = title;
        this.text = text;
        this._init();
    }

    S.augment(RestoreUI, {
        _init:function() {
            var self = this,editor = self.editor;
            self.el = new TripleButton({
                text:self.text,
                title:self.title,
                container:editor.toolBarDiv
            });
            this.el.set("state", TripleButton.DISABLED);
            /**
             * save,restore�꣬���¹�����״̬
             */
            editor.on("afterSave", this._respond, this);
            editor.on("afterRestore", this._respond, this);

            /**
             * ����������������������restore������ͬ
             */
            self.el.on("offClick", function() {
                editor.fire("restore", {
                    d:RedoMap[self.text]
                });
            });
        },

        _respond:function(ev) {
            var self = this,history = ev.history,
                index = ev.index;
            self.updateUI(history, index);
        },

        updateUI:function(history, index) {
            if (this.text == "undo") {
                if (index > 0 && history.length > 0) {
                    this.el.set("state", TripleButton.OFF);
                } else {
                    this.el.set("state", TripleButton.DISABLED);
                }
            } else if (this.text == "redo") {
                if (index < history.length - 1) {
                    this.el.set("state", TripleButton.OFF);
                } else {
                    this.el.set("state", TripleButton.DISABLED);
                }
            }
        }
    });


    KE.on("instanceCreated", function(ev) {
        var editor = ev.editor;

        /**
         * �༭����ʷ�������
         */
        new UndoManager(editor);

        /**
         * ������������ť
         */
        new RestoreUI(editor, "undo", "����");
        /**
         * ������������ť
         */
        new RestoreUI(editor, "redo", "����");
    });


});
(function() {
    var isIllustrator = (typeof app !== 'undefined' && app.name.indexOf('Illustrator') > -1);
    var isPhotoshop = (typeof app !== 'undefined' && app.name.indexOf('Photoshop') > -1);
    
    if (!isIllustrator && !isPhotoshop) {
        alert('This script is designed for Adobe Illustrator or Photoshop only.');
        return;
    }

    var config = {
        defaultGridW: 4,
        defaultGridH: 5,
        maxGridW: 8,
        maxGridH: 6,
        alternateFolder: null,
        favorites: [],
        hiddenScripts: [],
        customOrder: {},
        customNames: {},
        customNotes: {},
        showHidden: false,
        favoritesOnly: false
    };

    // Helper function since ExtendScript doesn't have String.trim()
    function trimString(str) {
        return str.replace(/^\s+|\s+$/g, '');
    }

    function getDefaultScriptFolders() {
        var folders = [];
        
        try {
            var scriptFolder = File($.fileName).parent;
            if (scriptFolder && scriptFolder.exists) {
                folders.push(scriptFolder);
            }
        } catch (e) {}
        
        if (isIllustrator) {
            var locations = [
                Folder.myDocuments + '/Adobe Scripts',
                app.path + '/Presets/Scripts',
                app.path + '/Scripts'
            ];
        } else if (isPhotoshop) {
            var locations = [
                Folder.myDocuments + '/Adobe Scripts',
                app.path + '/Presets/Scripts', 
                app.path + '/Scripts'
            ];
        }
        
        for (var i = 0; i < locations.length; i++) {
            try {
                var folder = new Folder(locations[i]);
                if (folder.exists) {
                    folders.push(folder);
                }
            } catch (e) {}
        }
        
        return folders;
    }

    function getScriptId(scriptFile) {
        return scriptFile.fsName;
    }

    function isFavorite(scriptFile) {
        var id = getScriptId(scriptFile);
        for (var i = 0; i < config.favorites.length; i++) {
            if (config.favorites[i] === id) return true;
        }
        return false;
    }

    function isHidden(scriptFile) {
        var id = getScriptId(scriptFile);
        for (var i = 0; i < config.hiddenScripts.length; i++) {
            if (config.hiddenScripts[i] === id) return true;
        }
        return false;
    }

    function toggleFavorite(scriptFile) {
        var id = getScriptId(scriptFile);
        var index = -1;
        for (var i = 0; i < config.favorites.length; i++) {
            if (config.favorites[i] === id) {
                index = i;
                break;
            }
        }
        
        if (index >= 0) {
            config.favorites.splice(index, 1);
        } else {
            config.favorites.push(id);
        }
    }

    function toggleHidden(scriptFile) {
        var id = getScriptId(scriptFile);
        var index = -1;
        for (var i = 0; i < config.hiddenScripts.length; i++) {
            if (config.hiddenScripts[i] === id) {
                index = i;
                break;
            }
        }
        
        if (index >= 0) {
            config.hiddenScripts.splice(index, 1);
        } else {
            config.hiddenScripts.push(id);
        }
    }

    function loadScripts() {
        var scripts = [];
        var folders = getDefaultScriptFolders();
        
        if (config.alternateFolder && config.alternateFolder.exists) {
            folders.push(config.alternateFolder);
        }

        for (var i = 0; i < folders.length; i++) {
            var folder = folders[i];
            if (!folder.exists) continue;

            try {
                var files = folder.getFiles(function(file) {
                    if (!(file instanceof File)) return false;
                    if (!/\.(jsx?|js)$/i.test(file.name)) return false;
                    var fileName = file.name.toLowerCase();
                    if (fileName.indexOf('script launcher') > -1) return false;
                    if (fileName.indexOf('scriptlauncher') > -1) return false;
                    return true;
                });

                for (var j = 0; j < files.length; j++) {
                    var scriptId = getScriptId(files[j]);
                    
                    var alreadyExists = false;
                    for (var k = 0; k < scripts.length; k++) {
                        if (scripts[k].id === scriptId) {
                            alreadyExists = true;
                            break;
                        }
                    }
                    
                    if (!alreadyExists) {
                        var filename = files[j].name.replace(/\.(jsx?|js)$/i, '');
                        filename = filename.replace(/%20/g, ' ').replace(/_/g, ' ');
                        
                        scripts.push({
                            file: files[j],
                            originalTitle: filename,
                            title: config.customNames[scriptId] || filename,
                            note: config.customNotes[scriptId] || '',
                            id: scriptId
                        });
                    }
                }
            } catch (e) {}
        }
        
        var favoriteScripts = [];
        var regularScripts = [];
        var hiddenScripts = [];
        
        for (var i = 0; i < scripts.length; i++) {
            var script = scripts[i];
            var hidden = isHidden(script.file);
            var favorite = isFavorite(script.file);
            
            if (config.favoritesOnly && !favorite) continue;
            
            if (hidden) {
                hiddenScripts.push(script);
            } else if (favorite) {
                favoriteScripts.push(script);
            } else {
                regularScripts.push(script);
            }
        }
        
        function sortScripts(a, b) {
            var aOrder = config.customOrder[a.id];
            var bOrder = config.customOrder[b.id];
            
            if (aOrder !== undefined && bOrder !== undefined) {
                return aOrder - bOrder;
            }
            if (aOrder !== undefined) return -1;
            if (bOrder !== undefined) return 1;
            return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        }
        
        favoriteScripts.sort(sortScripts);
        regularScripts.sort(sortScripts);
        hiddenScripts.sort(sortScripts);
        
        var allSortedScripts = [].concat(favoriteScripts, regularScripts, hiddenScripts);
        for (var i = 0; i < allSortedScripts.length; i++) {
            config.customOrder[allSortedScripts[i].id] = i;
        }
        
        return {
            favorites: favoriteScripts,
            regular: regularScripts,
            hidden: hiddenScripts
        };
    }

    function executeScript(scriptFile) {
        try {
            if (scriptFile.exists) {
                $.evalFile(scriptFile);
            }
        } catch (e) {
            alert('Error running script: ' + e.message);
        }
    }

    function loadSettings() {
        try {
            var settingsFile = new File("~/Desktop/ScriptLauncherSettings.txt");
            if (settingsFile.exists) {
                settingsFile.open("r");
                var content = settingsFile.read();
                settingsFile.close();
                
                if (content.length > 0) {
                    var allPrefs = eval('(' + content + ')');
                    var appKey = isIllustrator ? 'illustrator' : 'photoshop';
                    var prefs = allPrefs[appKey] || {};
                    
                    if (prefs.gridW) config.defaultGridW = prefs.gridW;
                    if (prefs.gridH) config.defaultGridH = prefs.gridH;
                    if (prefs.alternateFolder) {
                        var folder = new Folder(prefs.alternateFolder);
                        if (folder.exists) config.alternateFolder = folder;
                    }
                    if (prefs.favorites) config.favorites = prefs.favorites;
                    if (prefs.hiddenScripts) config.hiddenScripts = prefs.hiddenScripts;
                    if (prefs.customOrder) config.customOrder = prefs.customOrder;
                    if (prefs.customNames) config.customNames = prefs.customNames;
                    if (prefs.customNotes) config.customNotes = prefs.customNotes;
                    if (prefs.favoritesOnly !== undefined) config.favoritesOnly = prefs.favoritesOnly;
                    if (prefs.showHidden !== undefined) config.showHidden = prefs.showHidden;
                }
            }
        } catch (e) {}
    }

    function simpleFormat(obj) {
        // Just use basic JSON-like formatting that works in ExtendScript
        var str = obj.toSource();
        var result = '';
        var indent = 0;
        var inString = false;
        
        for (var i = 0; i < str.length; i++) {
            var currentChar = str.charAt(i);
            var prevChar = i > 0 ? str.charAt(i - 1) : '';
            
            if (currentChar === '"' && prevChar !== '\\') {
                inString = !inString;
            }
            
            if (!inString) {
                if (currentChar === '{' || currentChar === '[') {
                    result += currentChar + '\n';
                    indent++;
                    for (var j = 0; j < indent; j++) result += '  ';
                } else if (currentChar === '}' || currentChar === ']') {
                    result += '\n';
                    indent--;
                    for (var j = 0; j < indent; j++) result += '  ';
                    result += currentChar;
                } else if (currentChar === ',') {
                    result += currentChar + '\n';
                    for (var j = 0; j < indent; j++) result += '  ';
                } else {
                    result += currentChar;
                }
            } else {
                result += currentChar;
            }
        }
        
        return result;
    }

    function saveSettings(gridW, gridH, alternateFolder) {
        try {
            var settingsFile = new File("~/Desktop/ScriptLauncherSettings.txt");
            var allPrefs = {};
            
            if (settingsFile.exists) {
                settingsFile.open("r");
                var content = settingsFile.read();
                settingsFile.close();
                if (content.length > 0) {
                    allPrefs = eval('(' + content + ')');
                }
            }
            
            var appKey = isIllustrator ? 'illustrator' : 'photoshop';
            if (!allPrefs[appKey]) allPrefs[appKey] = {};
            
            allPrefs[appKey] = {
                gridW: gridW,
                gridH: gridH,
                alternateFolder: alternateFolder ? alternateFolder.fsName : null,
                favorites: config.favorites,
                hiddenScripts: config.hiddenScripts,
                customOrder: config.customOrder,
                customNames: config.customNames,
                customNotes: config.customNotes,
                favoritesOnly: config.favoritesOnly,
                showHidden: config.showHidden
            };
            
            settingsFile.open("w");
            settingsFile.write(simpleFormat(allPrefs));
            settingsFile.close();
        } catch (e) {
            alert('Error saving settings: ' + e.message);
        }
    }

    function showContextMenu(script, updateGridCallback) {
        var contextMenu = new Window('dialog', 'Script Options');
        contextMenu.orientation = 'column';
        contextMenu.alignChildren = 'fill';
        contextMenu.spacing = 5;
        contextMenu.margins = 10;

        var displayTitle = config.customNames[script.id] || script.originalTitle || script.title;
        var titleLabel = contextMenu.add('statictext', undefined, displayTitle);
        titleLabel.graphics.font = ScriptUI.newFont(titleLabel.graphics.font.name, ScriptUI.FontStyle.BOLD);
        
        contextMenu.add('panel').preferredSize.height = 1;

        var renameBtn = contextMenu.add('button', undefined, 'Rename Script');
        var currentNote = config.customNotes[script.id] || '';
        var noteBtn = contextMenu.add('button', undefined, currentNote ? 'Edit Note' : 'Add Note');
        
        contextMenu.add('panel').preferredSize.height = 1;

        var favBtn = contextMenu.add('button', undefined, isFavorite(script.file) ? 'Remove from Favorites' : 'Add to Favorites');
        var hideBtn = contextMenu.add('button', undefined, isHidden(script.file) ? 'Show Script' : 'Hide Script');
        
        contextMenu.add('panel').preferredSize.height = 1;
        
        var moveUpBtn = contextMenu.add('button', undefined, 'Move Up');
        var moveDownBtn = contextMenu.add('button', undefined, 'Move Down');
        
        contextMenu.add('panel').preferredSize.height = 1;
        
        var cancelBtn = contextMenu.add('button', undefined, 'Cancel');

        renameBtn.onClick = function() {
            contextMenu.close();
            
            // Create a proper dialog for renaming
            var renameDialog = new Window('dialog', 'Rename Script');
            renameDialog.orientation = 'column';
            renameDialog.alignChildren = 'fill';
            renameDialog.spacing = 10;
            renameDialog.margins = 15;
            
            renameDialog.add('statictext', undefined, 'Enter new name for script:');
            
            var currentName = config.customNames[script.id] || script.originalTitle || script.title;
            var nameField = renameDialog.add('edittext', undefined, currentName);
            nameField.characters = 40;
            nameField.active = true;
            
            var buttonGroup = renameDialog.add('group');
            buttonGroup.alignment = 'center';
            var okBtn = buttonGroup.add('button', undefined, 'OK');
            var cancelBtn = buttonGroup.add('button', undefined, 'Cancel');
            
            okBtn.onClick = function() {
                try {
                    var newName = nameField.text;
                    var trimmedName = trimString(newName);
                    
                    if (trimmedName !== '') {
                        if (!config.customNames) {
                            config.customNames = {};
                        }
                        
                        config.customNames[script.id] = trimmedName;
                        saveSettings(config.defaultGridW, config.defaultGridH, config.alternateFolder);
                        renameDialog.close();
                        updateGridCallback();
                    } else {
                        alert('Please enter a valid name.');
                    }
                } catch (e) {
                    alert('Error in rename: ' + e.message);
                }
            };
            
            cancelBtn.onClick = function() {
                renameDialog.close();
            };
            
            renameDialog.show();
        };

        noteBtn.onClick = function() {
            contextMenu.close();
            
            // Create a proper dialog for note editing
            var noteDialog = new Window('dialog', 'Edit Note');
            noteDialog.orientation = 'column';
            noteDialog.alignChildren = 'fill';
            noteDialog.spacing = 10;
            noteDialog.margins = 15;
            
            noteDialog.add('statictext', undefined, 'Enter note (up to 150 characters):');
            
            var currentNote = config.customNotes[script.id] || '';
            var noteField = noteDialog.add('edittext', undefined, currentNote, {multiline: true});
            noteField.characters = 40;
            noteField.preferredSize.height = 60;
            noteField.active = true;
            
            var buttonGroup = noteDialog.add('group');
            buttonGroup.alignment = 'center';
            var okBtn = buttonGroup.add('button', undefined, 'OK');
            var clearBtn = buttonGroup.add('button', undefined, 'Clear Note');
            var cancelBtn = buttonGroup.add('button', undefined, 'Cancel');
            
            okBtn.onClick = function() {
                try {
                    var newNote = noteField.text;
                    var trimmedNote = trimString(newNote);
                    
                    if (!config.customNotes) {
                        config.customNotes = {};
                    }
                    
                    if (trimmedNote === '') {
                        delete config.customNotes[script.id];
                    } else {
                        var shortNote = trimmedNote.substring(0, 150);
                        config.customNotes[script.id] = shortNote;
                    }
                    
                    saveSettings(config.defaultGridW, config.defaultGridH, config.alternateFolder);
                    noteDialog.close();
                    updateGridCallback();
                } catch (e) {
                    alert('Error in note: ' + e.message);
                }
            };
            
            clearBtn.onClick = function() {
                noteField.text = '';
            };
            
            cancelBtn.onClick = function() {
                noteDialog.close();
            };
            
            noteDialog.show();
        };

        favBtn.onClick = function() {
            toggleFavorite(script.file);
            saveSettings(config.defaultGridW, config.defaultGridH, config.alternateFolder);
            contextMenu.close();
            updateGridCallback();
        };

        hideBtn.onClick = function() {
            toggleHidden(script.file);
            saveSettings(config.defaultGridW, config.defaultGridH, config.alternateFolder);
            contextMenu.close();
            updateGridCallback();
        };

        moveUpBtn.onClick = function() {
            var scriptGroups = loadScripts();
            var allScripts = [].concat(scriptGroups.favorites, scriptGroups.regular, scriptGroups.hidden);
            var currentIndex = -1;
            
            for (var i = 0; i < allScripts.length; i++) {
                if (allScripts[i].id === script.id) {
                    currentIndex = i;
                    break;
                }
            }
            
            if (currentIndex > 0) {
                var aboveScript = allScripts[currentIndex - 1];
                var currentOrder = config.customOrder[script.id];
                var aboveOrder = config.customOrder[aboveScript.id];
                
                config.customOrder[script.id] = aboveOrder;
                config.customOrder[aboveScript.id] = currentOrder;
                
                saveSettings(config.defaultGridW, config.defaultGridH, config.alternateFolder);
                contextMenu.close();
                updateGridCallback();
            }
        };

        moveDownBtn.onClick = function() {
            var scriptGroups = loadScripts();
            var allScripts = [].concat(scriptGroups.favorites, scriptGroups.regular, scriptGroups.hidden);
            var currentIndex = -1;
            
            for (var i = 0; i < allScripts.length; i++) {
                if (allScripts[i].id === script.id) {
                    currentIndex = i;
                    break;
                }
            }
            
            if (currentIndex >= 0 && currentIndex < allScripts.length - 1) {
                var belowScript = allScripts[currentIndex + 1];
                var currentOrder = config.customOrder[script.id];
                var belowOrder = config.customOrder[belowScript.id];
                
                config.customOrder[script.id] = belowOrder;
                config.customOrder[belowScript.id] = currentOrder;
                
                saveSettings(config.defaultGridW, config.defaultGridH, config.alternateFolder);
                contextMenu.close();
                updateGridCallback();
            }
        };

        cancelBtn.onClick = function() {
            contextMenu.close();
        };

        contextMenu.show();
    }

    function createMainUI() {
        loadSettings();
        var scriptGroups = loadScripts();
        
        var dialog = new Window('dialog', 'Script Launcher');
        dialog.orientation = 'column';
        dialog.alignChildren = 'fill';
        dialog.preferredSize.width = 1200;
        dialog.preferredSize.height = 700;
        dialog.minimumSize.width = 1200;
        dialog.minimumSize.height = 700;
        dialog.maximumSize.width = 1200;
        dialog.maximumSize.height = 700;
        dialog.resizeable = false;

        var controlsPanel = dialog.add('panel');
        controlsPanel.orientation = 'row';
        controlsPanel.alignChildren = ['fill', 'center'];
        controlsPanel.margins = [10, 5, 10, 5];
        controlsPanel.preferredSize.height = 40;
        controlsPanel.minimumSize.height = 40;
        controlsPanel.maximumSize.height = 40;

        var titleLabel = controlsPanel.add('statictext', undefined, 'The ONE Script Launcher');
        titleLabel.graphics.font = ScriptUI.newFont(titleLabel.graphics.font.name, ScriptUI.FontStyle.BOLD, titleLabel.graphics.font.size + 2);

        var spacer = controlsPanel.add('panel');
        spacer.alignment = ['fill', 'center'];

        var rightControls = controlsPanel.add('group');
        rightControls.orientation = 'row';
        rightControls.alignment = ['right', 'center'];
        rightControls.spacing = 10;

        var optionsBtn = rightControls.add('button', undefined, 'Options');

        var gridPanel = dialog.add('panel');
        gridPanel.orientation = 'column';
        gridPanel.alignChildren = 'fill';
        gridPanel.margins = 0;
        gridPanel.preferredSize.height = 650;
        gridPanel.minimumSize.height = 650;
        gridPanel.maximumSize.height = 650;

        var buttonContainer = gridPanel.add('group');
        buttonContainer.orientation = 'column';
        buttonContainer.alignChildren = 'fill';
        buttonContainer.preferredSize.width = 1180;  // Reduced from 1200
        buttonContainer.preferredSize.height = 650;
        buttonContainer.minimumSize.width = 1180;    // Reduced from 1200
        buttonContainer.minimumSize.height = 650;
        buttonContainer.maximumSize.width = 1180;    // Reduced from 1200
        buttonContainer.maximumSize.height = 650;

        var currentGridW = config.defaultGridW;
        var currentGridH = config.defaultGridH;
        var currentPage = 0;

        function updateGrid() {
            scriptGroups = loadScripts();
            
            for (var i = buttonContainer.children.length - 1; i >= 0; i--) {
                buttonContainer.remove(buttonContainer.children[i]);
            }

            var allItems = [];

            if (scriptGroups.favorites.length > 0) {
                allItems.push({type: 'label', text: 'Favorites'});
                
                for (var i = 0; i < scriptGroups.favorites.length; i++) {
                    allItems.push({type: 'script', data: scriptGroups.favorites[i]});
                }
                
                allItems.push({type: 'separator'});
            }

            for (var i = 0; i < scriptGroups.regular.length; i++) {
                allItems.push({type: 'script', data: scriptGroups.regular[i]});
            }

            if (scriptGroups.hidden.length > 0 && config.showHidden) {
                for (var i = 0; i < scriptGroups.hidden.length; i++) {
                    allItems.push({type: 'script', data: scriptGroups.hidden[i]});
                }
            }

            if (allItems.length === 0) {
                var msg = 'No scripts found';
                if (config.favoritesOnly) msg = 'No favorite scripts';
                
                var noScriptsLabel = buttonContainer.add('statictext', undefined, msg);
                noScriptsLabel.alignment = 'center';
                
                dialog.layout.layout(true);
                dialog.layout.resize();
                return;
            }

            var containerWidth = 1180; // Reduced from 1200 to give more margin
            var containerHeight = 580;  // Reduced to give more room
            var buttonWidth = Math.floor(containerWidth / currentGridW) - 4; // Increased margin
            var buttonHeight = Math.floor(containerHeight / currentGridH) - 4; // Increased margin

            var scriptCount = 0;
            for (var i = 0; i < allItems.length; i++) {
                if (allItems[i].type === 'script') scriptCount++;
            }
            
            var maxButtonsPerPage = currentGridW * currentGridH;
            var totalPages = Math.max(1, Math.ceil(scriptCount / maxButtonsPerPage));
            
            if (currentPage >= totalPages) currentPage = 0;
            
            if (totalPages > 1) {
                var pageControls = buttonContainer.add('group');
                pageControls.orientation = 'row';
                pageControls.alignment = 'center';
                pageControls.spacing = 10;
                pageControls.preferredSize.height = 30;
                
                var prevBtn = pageControls.add('button', undefined, '< Previous');
                prevBtn.enabled = currentPage > 0;
                
                var pageLabel = pageControls.add('statictext', undefined, 'Page ' + (currentPage + 1) + ' of ' + totalPages);
                pageLabel.alignment = 'center';
                
                var nextBtn = pageControls.add('button', undefined, 'Next >');
                nextBtn.enabled = currentPage < totalPages - 1;
                
                prevBtn.onClick = function() {
                    if (currentPage > 0) {
                        currentPage--;
                        updateGrid();
                    }
                };
                
                nextBtn.onClick = function() {
                    if (currentPage < totalPages - 1) {
                        currentPage++;
                        updateGrid();
                    }
                };
            }

            var currentRow = 0;
            var currentCol = 0;
            var rowGroup = null;
            var buttonsRendered = 0;
            var startIndex = currentPage * maxButtonsPerPage;
            var endIndex = Math.min(startIndex + maxButtonsPerPage, scriptCount);

            for (var i = 0; i < allItems.length; i++) {
                var item = allItems[i];

                if (item.type === 'script') {
                    if (buttonsRendered < startIndex) {
                        buttonsRendered++;
                        continue;
                    }
                    if (buttonsRendered >= endIndex) {
                        break;
                    }
                    
                    if (currentCol === 0) {
                        rowGroup = buttonContainer.add('group');
                        rowGroup.orientation = 'row';
                        rowGroup.alignment = 'fill';
                        rowGroup.spacing = 0;
                        rowGroup.margins = 0;
                        rowGroup.preferredSize.height = buttonHeight;
                    }
                    
                    var buttonGroup = rowGroup.add('group');
                    buttonGroup.orientation = 'column';
                    buttonGroup.preferredSize.width = buttonWidth;
                    buttonGroup.preferredSize.height = buttonHeight;
                    buttonGroup.alignment = 'fill';
                    buttonGroup.spacing = 1;

                    var displayTitle = config.customNames[item.data.id] || item.data.originalTitle;
                    var displayNote = config.customNotes[item.data.id] || '';
                    
                    var btnText = displayTitle;
                    if (displayNote && trimString(displayNote) !== '') {
                        var note = trimString(displayNote);
                        var formattedNote = '';
                        var words = note.split(' ');
                        var currentLine = '';
                        var lineCount = 0;
                        
                        for (var w = 0; w < words.length && lineCount < 3; w++) {
                            var testLine = currentLine + (currentLine ? ' ' : '') + words[w];
                            if (testLine.length <= 17) {
                                currentLine = testLine;
                            } else {
                                if (currentLine) {
                                    formattedNote += (formattedNote ? '\n' : '') + currentLine;
                                    lineCount++;
                                    currentLine = words[w];
                                } else {
                                    formattedNote += (formattedNote ? '\n' : '') + words[w].substring(0, 17);
                                    lineCount++;
                                }
                            }
                        }
                        if (currentLine && lineCount < 3) {
                            formattedNote += (formattedNote ? '\n' : '') + currentLine;
                        }
                        
                        btnText += (isPhotoshop ? ' - ' : '\n\n') + formattedNote; // Use dash separator in Photoshop
                    }
                    
                    var mainBtn = buttonGroup.add('button', undefined, btnText);
                    mainBtn.preferredSize.width = buttonWidth;
                    mainBtn.preferredSize.height = buttonHeight - 25;
                    mainBtn.alignment = 'fill';
                    
                    var menuRow = buttonGroup.add('group');
                    menuRow.orientation = 'row';
                    menuRow.alignment = 'fill';
                    menuRow.preferredSize.height = 20;
                    
                    var spacer = menuRow.add('panel');
                    spacer.alignment = ['fill', 'center'];
                    
                    var menuBtn = menuRow.add('button', undefined, '...');
                    menuBtn.preferredSize.width = 30;
                    menuBtn.preferredSize.height = 20;
                    menuBtn.alignment = ['right', 'center'];
                    
                    mainBtn.scriptFile = item.data.file;
                    menuBtn.scriptData = item.data;
                    
                    mainBtn.onClick = function() {
                        dialog.close();
                        executeScript(this.scriptFile);
                    };
                    
                    menuBtn.onClick = function() {
                        showContextMenu(this.scriptData, updateGrid);
                    };
                    
                    currentCol++;
                    buttonsRendered++;
                    
                    if (currentCol >= currentGridW) {
                        currentCol = 0;
                        currentRow++;
                    }
                }
            }

            if (currentCol > 0) {
                while (currentCol < currentGridW) {
                    var placeholder = rowGroup.add('panel');
                    placeholder.preferredSize.width = buttonWidth;
                    placeholder.preferredSize.height = buttonHeight;
                    currentCol++;
                }
            }

            dialog.layout.layout(true);
            dialog.layout.resize();
        }

        function showOptionsMenu() {
            var optionsMenu = new Window('dialog', 'Script Launcher Options');
            optionsMenu.orientation = 'column';
            optionsMenu.alignChildren = 'fill';
            optionsMenu.spacing = 10;
            optionsMenu.margins = 15;

            var gridGroup = optionsMenu.add('group');
            gridGroup.add('statictext', undefined, 'Grid Size:');
            var gridWText = gridGroup.add('edittext', undefined, currentGridW.toString());
            gridWText.characters = 2;
            gridGroup.add('statictext', undefined, 'x');
            var gridHText = gridGroup.add('edittext', undefined, currentGridH.toString());
            gridHText.characters = 2;

            optionsMenu.add('panel').preferredSize.height = 1;

            optionsMenu.add('statictext', undefined, 'View Options:');
            var favOnlyBtn = optionsMenu.add('button', undefined, config.favoritesOnly ? 'Show All Scripts' : 'Show Favorites Only');

            optionsMenu.add('panel').preferredSize.height = 1;

            optionsMenu.add('statictext', undefined, 'Script Management:');
            var folderBtn = optionsMenu.add('button', undefined, 'Set Alternate Scripts Folder');
            var reloadBtn = optionsMenu.add('button', undefined, 'Reload Scripts');
            
            optionsMenu.add('panel').preferredSize.height = 1;

            optionsMenu.add('statictext', undefined, 'Organization:');
            var clearFavBtn = optionsMenu.add('button', undefined, 'Clear All Favorites');
            var showHiddenBtn = optionsMenu.add('button', undefined, config.showHidden ? 'Hide Hidden Scripts' : 'Show Hidden Scripts (' + scriptGroups.hidden.length + ')');
            var clearCustomBtn = optionsMenu.add('button', undefined, 'Clear All Custom Names & Notes');
            var resetOrderBtn = optionsMenu.add('button', undefined, 'Reset Custom Order');
            
            optionsMenu.add('panel').preferredSize.height = 1;
            
            var closeOptsBtn = optionsMenu.add('button', undefined, 'Close');

            gridWText.onChange = function() {
                var val = parseInt(this.text) || config.defaultGridW;
                if (val < 1) val = 1;
                if (val > config.maxGridW) val = config.maxGridW;
                this.text = val.toString();
                currentGridW = val;
                saveSettings(currentGridW, currentGridH, config.alternateFolder);
                updateGrid();
            };

            gridHText.onChange = function() {
                var val = parseInt(this.text) || config.defaultGridH;
                if (val < 1) val = 1;
                if (val > config.maxGridH) val = config.maxGridH;
                this.text = val.toString();
                currentGridH = val;
                saveSettings(currentGridW, currentGridH, config.alternateFolder);
                updateGrid();
            };

            favOnlyBtn.onClick = function() {
                config.favoritesOnly = !config.favoritesOnly;
                this.text = config.favoritesOnly ? 'Show All Scripts' : 'Show Favorites Only';
                saveSettings(currentGridW, currentGridH, config.alternateFolder);
                optionsMenu.close();
                updateGrid();
            };

            folderBtn.onClick = function() {
                var folder = Folder.selectDialog('Select alternate scripts folder');
                if (folder) {
                    config.alternateFolder = folder;
                    saveSettings(currentGridW, currentGridH, config.alternateFolder);
                    optionsMenu.close();
                    updateGrid();
                }
            };

            reloadBtn.onClick = function() {
                optionsMenu.close();
                updateGrid();
            };

            clearFavBtn.onClick = function() {
                if (confirm('Clear all favorites?')) {
                    config.favorites = [];
                    saveSettings(currentGridW, currentGridH, config.alternateFolder);
                    optionsMenu.close();
                    updateGrid();
                }
            };

            showHiddenBtn.onClick = function() {
                config.showHidden = !config.showHidden;
                saveSettings(currentGridW, currentGridH, config.alternateFolder);
                optionsMenu.close();
                updateGrid();
            };

            clearCustomBtn.onClick = function() {
                if (confirm('Clear all custom names and notes?')) {
                    config.customNames = {};
                    config.customNotes = {};
                    saveSettings(currentGridW, currentGridH, config.alternateFolder);
                    optionsMenu.close();
                    updateGrid();
                }
            };

            resetOrderBtn.onClick = function() {
                if (confirm('Reset custom order for all scripts?')) {
                    config.customOrder = {};
                    saveSettings(currentGridW, currentGridH, config.alternateFolder);
                    optionsMenu.close();
                    updateGrid();
                }
            };

            closeOptsBtn.onClick = function() {
                optionsMenu.close();
            };

            optionsMenu.show();
        }

        optionsBtn.onClick = function() {
            showOptionsMenu();
        };

        dialog.onClose = function() {
            saveSettings(currentGridW, currentGridH, config.alternateFolder);
        };

        updateGrid();
        dialog.show();
    }

    createMainUI();
})();